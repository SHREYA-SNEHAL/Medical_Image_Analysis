"""
python_api/app.py
=================
Replaces your old pneumonia-only Flask server.
Now handles:
  - Chest X-Ray → 14 diseases (DenseNet121)
  - Brain MRI   → 8 conditions (EfficientNetB3)
  - Grad-CAM heatmap for doctor view

Run:
    pip install flask flask-cors torch torchvision timm pillow pytorch-grad-cam
    python app.py
"""

import os
import io
import json
import base64
import numpy as np
from PIL import Image

import torch
import torch.nn as nn
from torchvision import models, transforms
import timm

from flask import Flask, request, jsonify
from flask_cors import CORS

from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image

app = Flask(__name__)
CORS(app)

# ============================================================
# PATHS — model files go inside python_api/model/
# ============================================================
BASE_DIR           = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR          = os.path.join(BASE_DIR, 'model')

XRAY_MODEL_PATH    = os.path.join(MODEL_DIR, 'xray_model.pth')
XRAY_CLASSES_PATH  = os.path.join(MODEL_DIR, 'xray_classes.json')
MRI_MODEL_PATH     = os.path.join(MODEL_DIR, 'mri_model.pth')
MRI_CLASSES_PATH   = os.path.join(MODEL_DIR, 'mri_class_mapping.json')

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f'[INFO] Device: {device}')

# ============================================================
# LOAD XRAY MODEL (DenseNet121 — 14 diseases)
# ============================================================
def load_xray_model():
    with open(XRAY_CLASSES_PATH) as f:
        classes = json.load(f)

    model = models.densenet121(weights=None)
    model.classifier = nn.Sequential(
        nn.Linear(model.classifier.in_features, 512),
        nn.ReLU(),
        nn.Dropout(0.3),
        nn.Linear(512, len(classes))
    )
    model.load_state_dict(torch.load(XRAY_MODEL_PATH, map_location=device))
    model.eval().to(device)
    print(f'[INFO] X-Ray model loaded — {len(classes)} classes')
    return model, classes

# ============================================================
# LOAD MRI MODEL (EfficientNetB3 — 8 conditions)
# ============================================================
def load_mri_model():
    with open(MRI_CLASSES_PATH) as f:
        idx_to_class = json.load(f)

    model = timm.create_model('efficientnet_b3', pretrained=False, num_classes=len(idx_to_class))
    model.load_state_dict(torch.load(MRI_MODEL_PATH, map_location=device))
    model.eval().to(device)
    print(f'[INFO] MRI model loaded — {len(idx_to_class)} classes')
    return model, idx_to_class

# Load both models at startup
try:
    xray_model, xray_classes = load_xray_model()
except Exception as e:
    print(f'[WARN] X-Ray model not loaded: {e}')
    xray_model, xray_classes = None, []

try:
    mri_model, mri_classes = load_mri_model()
except Exception as e:
    print(f'[WARN] MRI model not loaded: {e}')
    mri_model, mri_classes = None, {}

# ============================================================
# IMAGE TRANSFORMS
# ============================================================
xray_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                         [0.229, 0.224, 0.225])
])

mri_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                         [0.229, 0.224, 0.225])
])

# ============================================================
# HELPER — Preprocess image bytes to tensor
# ============================================================
def preprocess(image_bytes, transform):
    img     = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    img_vis = np.array(img.resize((224, 224))) / 255.0  # for heatmap overlay
    tensor  = transform(img).unsqueeze(0).to(device)
    return tensor, img_vis

# ============================================================
# HELPER — Generate Grad-CAM heatmap → base64 string
# ============================================================
def generate_heatmap(model, tensor, img_vis, target_layer):
    try:
        cam           = GradCAM(model=model, target_layers=[target_layer])
        grayscale_cam = cam(input_tensor=tensor)
        visualization = show_cam_on_image(
            img_vis.astype(np.float32),
            grayscale_cam[0],
            use_rgb=True
        )
        heatmap_img = Image.fromarray(visualization)
        buffer      = io.BytesIO()
        heatmap_img.save(buffer, format='PNG')
        return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode('utf-8')
    except Exception as e:
        print(f'[WARN] Heatmap failed: {e}')
        return None

# ============================================================
# ROUTE — Health Check
# ============================================================
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status'     : 'ok',
        'xray_model' : xray_model is not None,
        'mri_model'  : mri_model  is not None,
        'device'     : str(device)
    })

# ============================================================
# ROUTE — Main Prediction
# POST /predict
# Form fields:
#   image     : image file
#   imageType : 'xray' or 'mri'
#   role      : 'patient' or 'doctor'
# ============================================================
@app.route('/predict', methods=['POST'])
def predict():
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image uploaded'}), 400

        image_type = request.form.get('imageType', 'xray').lower()
        role       = request.form.get('role', 'patient').lower()
        image_bytes = request.files['image'].read()

        # ---- XRAY ----
        if image_type == 'xray':
            if xray_model is None:
                return jsonify({'error': 'X-Ray model not loaded'}), 500

            tensor, img_vis = preprocess(image_bytes, xray_transform)

            with torch.no_grad():
                outputs = xray_model(tensor)
                probs   = torch.sigmoid(outputs).squeeze().cpu().numpy()

            results = sorted(
                [(xray_classes[i], float(probs[i])) for i in range(len(xray_classes))],
                key=lambda x: x[1], reverse=True
            )

            top_disease    = results[0][0]
            top_confidence = round(results[0][1] * 100, 1)

            # Patient — only disease + confidence
            if role == 'patient':
                return jsonify({
                    'imageType'  : 'Chest X-Ray',
                    'disease'    : top_disease,
                    'confidence' : top_confidence,
                    'message'    : 'Please consult a doctor for proper diagnosis.'
                })

            # Doctor — top 5 + heatmap
            top5    = [{'disease': d, 'confidence': round(c * 100, 1)} for d, c in results[:5]]
            heatmap = generate_heatmap(
                xray_model, tensor, img_vis,
                xray_model.features.denseblock4
            )
            return jsonify({
                'imageType'  : 'Chest X-Ray',
                'disease'    : top_disease,
                'confidence' : top_confidence,
                'top5'       : top5,
                'heatmap'    : heatmap
            })

        # ---- MRI ----
        elif image_type == 'mri':
            if mri_model is None:
                return jsonify({'error': 'MRI model not loaded'}), 500

            tensor, img_vis = preprocess(image_bytes, mri_transform)

            with torch.no_grad():
                outputs = mri_model(tensor)
                probs   = torch.softmax(outputs, dim=1).squeeze().cpu().numpy()

            results = sorted(
                [(mri_classes[str(i)], float(probs[i])) for i in range(len(probs))],
                key=lambda x: x[1], reverse=True
            )

            top_disease    = results[0][0].replace('_', ' ').title()
            top_confidence = round(results[0][1] * 100, 1)

            # Patient — only disease + confidence
            if role == 'patient':
                return jsonify({
                    'imageType'  : 'Brain MRI',
                    'disease'    : top_disease,
                    'confidence' : top_confidence,
                    'message'    : 'Please consult a neurologist for proper diagnosis.'
                })

            # Doctor — top 5 + heatmap
            top5 = [
                {'disease': d.replace('_', ' ').title(), 'confidence': round(c * 100, 1)}
                for d, c in results[:5]
            ]
            heatmap = generate_heatmap(
                mri_model, tensor, img_vis,
                mri_model.conv_head
            )
            return jsonify({
                'imageType'  : 'Brain MRI',
                'disease'    : top_disease,
                'confidence' : top_confidence,
                'top5'       : top5,
                'heatmap'    : heatmap
            })

        else:
            return jsonify({'error': f'Unknown imageType: {image_type}'}), 400

    except Exception as e:
        print(f'[ERROR] {e}')
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print('[INFO] Starting Flask server on port 5000...')
    app.run(host='0.0.0.0', port=5000, debug=False)