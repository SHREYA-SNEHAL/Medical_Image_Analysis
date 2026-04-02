# Project Setup Guide

## 1. Clone Repository
```bash
git clone <repo-url>
cd Final Year Project

2. Backend (Node.js)
cd backend
npm install
node app.js


Server runs on:
http://localhost:4000

3. Python ML API
cd python_api
pip install -r requirements.txt
python app.py


Server runs on:
http://localhost:5000

4. Database

Create MySQL DB: medical_ai_db

Update credentials in backend/config/db.js

Notes

ML model (.h5) is not included due to size

Place trained model at:
python_api/model/pneumonia_model.h5