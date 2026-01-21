# AI-Based Medical Image Analysis Tool

## Tech Stack
- Backend: Node.js, Express, Sequelize, JWT
- AI/ML: Python, TensorFlow, MobileNetV2
- Explainability: Grad-CAM
- Database: MySQL
- Frontend: (Handled separately)

## Features
- User authentication (Doctor / Patient)
- X-ray image upload
- Pneumonia detection using CNN
- Role-based output
  - Patient: Prediction + Confidence
  - Doctor: Prediction + Confidence + Grad-CAM

## Repository Structure
- `backend/` → Node.js API
- `python_api/` → ML inference + Grad-CAM
