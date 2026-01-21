from flask import Flask, request, jsonify
import os
import numpy as np
import cv2
import tensorflow as tf
from tensorflow.keras.models import load_model
from grad_cam import generate_gradcam

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"
HEATMAP_FOLDER = "heatmaps"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(HEATMAP_FOLDER, exist_ok=True)

model = load_model("model/pneumonia_model.h5")

def preprocess_image(image_path):
    img = cv2.imread(image_path)
    img_resized = cv2.resize(img, (224, 224))
    img_array = img_resized / 255.0
    img_array = np.expand_dims(img_array, axis=0)
    return img_array, img_resized


@app.route("/predict", methods=["POST"])
def predict():
    file = request.files.get("image")
    role = request.form.get("role")  # doctor or patient

    if not file:
        return jsonify({"error": "No image uploaded"}), 400

    image_path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(image_path)

    img_array, original_img = preprocess_image(image_path)

    prediction = model.predict(img_array)[0][0]
    confidence = float(prediction)

    result = "Pneumonia" if confidence > 0.5 else "Normal"
    confidence = confidence if confidence > 0.5 else 1 - confidence

    response = {
        "prediction": result,
        "confidence": round(confidence * 100, 2)
    }

    # Grad-CAM only for doctors
    if role == "doctor":
        heatmap_path = os.path.join(
            HEATMAP_FOLDER, "gradcam_" + file.filename
        )

        generate_gradcam(
            model,
            img_array,
            original_img,
            heatmap_path
        )

        response["gradcam_path"] = heatmap_path

    return jsonify(response)


if __name__ == "__main__":
    app.run(port=5000, debug=True)
