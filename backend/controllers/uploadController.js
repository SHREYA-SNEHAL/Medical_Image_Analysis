// backend/controllers/uploadController.js
// =========================================
// Changes from original:
//   1. Reads imageType from request body ('xray' or 'mri')
//   2. Sends imageType to Python server
//   3. Handles new response format (disease, confidence, top5, heatmap)
//   4. Saves imageType in database

const Upload = require("../models/Upload");
const axios  = require("axios");
const fs     = require("fs");
const FormData = require("form-data");

// Risk level based on confidence %
function getRiskLevel(confidence) {
  if (confidence >= 75) return "High Risk";
  if (confidence >= 45) return "Medium Risk";
  return "Low Risk";
}

// Doctor recommendation based on disease
function getRecommendation(disease, confidence) {
  if (confidence < 30) return "Low probability. Routine checkup recommended.";

  const recommendations = {
    "Pneumonia"          : "Antibiotic treatment may be required. Consult pulmonologist.",
    "Effusion"           : "Pleural fluid detected. Drainage may be needed.",
    "Cardiomegaly"       : "Enlarged heart detected. Cardiology referral recommended.",
    "Atelectasis"        : "Lung collapse detected. Breathing exercises advised.",
    "Glioma Tumor"       : "Brain tumor detected. Immediate neurology referral required.",
    "Meningioma Tumor"   : "Meningioma detected. MRI follow-up and neurosurgery consult.",
    "Pituitary Tumor"    : "Pituitary abnormality. Endocrinology referral recommended.",
    "Mild Alzheimer"     : "Early Alzheimer signs. Cognitive therapy and monitoring advised.",
    "Moderate Alzheimer" : "Moderate Alzheimer detected. Memory care program recommended.",
  };

  return recommendations[disease] || "Consult specialist for further evaluation.";
}
exports.uploadImage = async (req, res) => {
  try {
    const user      = req.user;           // from JWT (has id, role)
    const imagePath = req.file.path;
    const imageType = req.body.imageType || "xray"; // 'xray' or 'mri'

    console.log(`[Upload] User: ${user.id} | Role: ${user.role} | Type: ${imageType}`);

    // ---- Send image to Python Flask server ----
    const formData = new FormData();
    formData.append("image",     fs.createReadStream(imagePath));
    formData.append("role",      user.role);   // 'doctor' or 'patient'
    formData.append("imageType", imageType);   // 'xray' or 'mri'

    const pythonResponse = await axios.post(
      "http://localhost:5000/predict",
      formData,
      {
        headers : formData.getHeaders(),
        timeout : 60000  // 60 seconds
      }
    );

    const result = pythonResponse.data;
    // result contains: { imageType, disease, confidence, message?, top5?, heatmap? }

    // ---- Save result to database ----
    await Upload.create({
      userId    : user.id,
      imagePath : imagePath,
      imageType : imageType,
      result    : result.disease,
      confidence: result.confidence
    });

    // ---- Role-based response ----
    // Patient: only disease + confidence
    // Doctor : disease + confidence + top5 list + heatmap
    if (user.role === "patient") {
      return res.json({
        success    : true,
        imageType  : result.imageType,
        disease    : result.disease,
        chancePercent: result.confidence,        // rename confidence → chancePercent
        riskLevel    : getRiskLevel(result.confidence), // NEW — High/Medium/Low
        message    : result.message
      });

    } else {
      // doctor
      return res.json({
        success    : true,
        imageType  : result.imageType,
        disease    : result.disease,
        chancePercent: result.confidence,
        riskLevel    : getRiskLevel(result.confidence),
        top5       : result.top5,    // array of {disease, confidence}
        heatmap    : result.heatmap, // base64 image string
        recommendation: getRecommendation(result.disease, result.confidence)
      });
    }

  } catch (error) {
    console.error("[Upload Error]", error.message);

    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (error.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "AI service offline. Make sure python_api/app.py is running."
      });
    }

    res.status(500).json({ error: "Prediction failed: " + error.message });
  }
};