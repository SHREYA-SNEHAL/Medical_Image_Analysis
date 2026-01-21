const Upload = require("../models/Upload");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

exports.uploadImage = async (req, res) => {
  try {
    const user = req.user; // from JWT
    const imagePath = req.file.path;

    // ---------- SEND IMAGE TO PYTHON ----------
    const formData = new FormData();
    formData.append("image", fs.createReadStream(imagePath));
    formData.append("role", user.role);

    const pythonResponse = await axios.post(
      "http://localhost:5000/predict",
      formData,
      {
        headers: formData.getHeaders()
      }
    );

    const { prediction, confidence, gradcam_path } = pythonResponse.data;

    // ---------- STORE RESULT ----------
    const record = await Upload.create({
      userId: user.id,
      imagePath: imagePath,
      result: prediction,
      confidence: confidence
    });

    // ---------- ROLE-BASED RESPONSE ----------
    if (user.role === "doctor") {
      return res.json({
        prediction,
        confidence,
        gradcam: gradcam_path
      });
    } else {
      return res.json({
        prediction,
        confidence
      });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Prediction failed" });
  }
};
