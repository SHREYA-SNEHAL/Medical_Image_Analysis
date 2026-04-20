// backend/controllers/uploadController.js
// =========================================
// Changes from original:
//   1. Reads imageType from request body ('xray' or 'mri')
//   2. Sends imageType to Python server
//   3. Handles new response format (disease, confidence, top5, heatmap)
//   4. Saves imageType in database

// backend/controllers/uploadController.js
 
const Upload      = require("../models/Upload");
const User        = require("../models/User");
const axios       = require("axios");
const fs          = require("fs");
const path        = require("path");
const FormData    = require("form-data");

 
// ============================================================
// HELPER — Risk Level
// ============================================================
function getRiskLevel(confidence) {
  if (confidence >= 75) return "High Risk";
  if (confidence >= 45) return "Medium Risk";
  return "Low Risk";
}
 
// ============================================================
// HELPER — Second Opinion Flag
// ============================================================
function getSecondOpinion(confidence) {
  if (confidence >= 40 && confidence <= 60) {
    return "Borderline result — second opinion recommended";
  }
  return null;
}
 
// ============================================================
// HEALTH GUIDANCE DATABASE — All 22 conditions
// ============================================================
const healthGuidance = {
 
  // ── CHEST X-RAY DISEASES ─────────────────────────────────
 
  "Pneumonia": {
    explanation : "Pneumonia is an infection that inflames the air sacs in one or both lungs. It can cause cough, fever, and difficulty breathing.",
    precautions : ["Take plenty of rest and avoid physical strain", "Stay in a warm and clean environment", "Avoid smoking and second-hand smoke", "Wash hands regularly to prevent spreading infection"],
    eat         : ["Warm soups and broths", "Fruits rich in Vitamin C (orange, lemon)", "Ginger and turmeric tea", "Honey with warm water"],
    avoid       : ["Cold drinks and ice cream", "Fried and oily foods", "Dairy products (can increase mucus)", "Alcohol and smoking"],
    activity    : "Complete bed rest is recommended. Light breathing exercises after recovery. Avoid outdoor exposure until fully recovered.",
    nextSteps   : ["See a doctor immediately if breathing worsens", "Get a follow-up chest X-ray after 4-6 weeks", "Blood tests (CBC) may be needed to monitor infection"]
  },
 
  "Effusion": {
    explanation : "Pleural effusion is a buildup of excess fluid between the layers of tissue lining the lungs and chest cavity.",
    precautions : ["Avoid lying flat — sleep with head elevated", "Limit physical activity until fluid is resolved", "Monitor breathing difficulty closely", "Avoid cold and damp environments"],
    eat         : ["Anti-inflammatory foods like berries and leafy greens", "Garlic and onions", "Omega-3 rich foods like flaxseeds", "Warm herbal teas"],
    avoid       : ["Salty foods (increase fluid retention)", "Processed and packaged foods", "Alcohol", "Cold beverages"],
    activity    : "Avoid strenuous activity. Gentle walking only if breathing is comfortable. Deep breathing exercises with doctor guidance.",
    nextSteps   : ["Consult a pulmonologist immediately", "Ultrasound or CT scan may be recommended", "Monitor oxygen levels at home if advised"]
  },
 
  "Cardiomegaly": {
    explanation : "Cardiomegaly means the heart is enlarged. It is not a disease itself but a sign of another condition like high blood pressure or heart disease.",
    precautions : ["Strictly monitor blood pressure regularly", "Avoid heavy physical lifting or strain", "Reduce stress through meditation or light yoga", "Take prescribed medications consistently"],
    eat         : ["Low-sodium foods", "Fruits and vegetables", "Whole grains like oats and brown rice", "Nuts like almonds and walnuts"],
    avoid       : ["Salty and processed foods", "Saturated fats and fried food", "Alcohol and caffeine", "Sugary drinks"],
    activity    : "Only light walking as tolerated. No intense exercise without cardiologist approval. Yoga and meditation are beneficial.",
    nextSteps   : ["Consult a cardiologist as soon as possible", "ECG and echocardiogram tests recommended", "Regular blood pressure monitoring at home"]
  },
 
  "Atelectasis": {
    explanation : "Atelectasis is a condition where part or all of a lung collapses or does not inflate properly, reducing oxygen exchange.",
    precautions : ["Practice deep breathing exercises regularly", "Change positions frequently if bedridden", "Avoid smoking completely", "Use a spirometer if provided by doctor"],
    eat         : ["High fiber foods to avoid constipation", "Antioxidant-rich fruits and vegetables", "Lean proteins like eggs and fish", "Warm fluids"],
    avoid       : ["Smoking and second-hand smoke", "Heavy meals that press on diaphragm", "Alcohol", "Cold foods"],
    activity    : "Gentle breathing exercises and incentive spirometry. Slow walking as tolerated. Avoid lying in one position too long.",
    nextSteps   : ["Follow up with a pulmonologist", "Chest physiotherapy may be recommended", "CT scan of chest if not resolved"]
  },
 
  "Consolidation": {
    explanation : "Lung consolidation means lung tissue has filled with liquid or solid material instead of air, usually due to infection or inflammation.",
    precautions : ["Rest completely and stay hydrated", "Avoid exposure to cold air", "Do not self-medicate with antibiotics", "Monitor temperature and oxygen levels"],
    eat         : ["Warm soups", "Vitamin C rich foods", "Garlic and ginger", "Fresh juices"],
    avoid       : ["Cold drinks", "Oily and spicy food", "Dairy (increases mucus)", "Smoking"],
    activity    : "Complete rest initially. Light walking only after improvement. Breathing exercises with doctor guidance.",
    nextSteps   : ["Immediate doctor consultation required", "Sputum culture test recommended", "Follow-up X-ray after treatment"]
  },
 
  "Edema": {
    explanation : "Pulmonary edema is a condition where fluid accumulates in the lungs, making it difficult to breathe. It is often related to heart problems.",
    precautions : ["Restrict salt intake strictly", "Monitor body weight daily (sudden increase = fluid retention)", "Sleep with head elevated", "Avoid strenuous activity"],
    eat         : ["Low-sodium foods", "Potassium-rich foods like banana and sweet potato", "Leafy greens", "Berries"],
    avoid       : ["Salty snacks and pickles", "Processed meats", "Alcohol", "Excessive fluids unless advised"],
    activity    : "Minimal activity during acute phase. Light walking only with doctor clearance. No strenuous exercise.",
    nextSteps   : ["Emergency medical attention if breathing is severely compromised", "Cardiology consultation required", "Echocardiogram and chest X-ray follow-up"]
  },
 
  "Emphysema": {
    explanation : "Emphysema is a lung condition that causes shortness of breath due to damage to the air sacs in the lungs. It is commonly caused by smoking.",
    precautions : ["Stop smoking immediately — most critical step", "Avoid air pollution and dust", "Use prescribed inhalers correctly", "Get flu and pneumonia vaccines"],
    eat         : ["High-calorie, nutrient-dense foods", "Lean protein like fish and chicken", "Fresh fruits and vegetables", "Small frequent meals"],
    avoid       : ["Smoking and passive smoke", "Gas-producing foods (bloating affects breathing)", "Cold and dry foods", "Alcohol"],
    activity    : "Light walking and pulmonary rehabilitation exercises. Breathing techniques like pursed-lip breathing. No heavy exercise.",
    nextSteps   : ["Pulmonologist consultation required", "Pulmonary function test (PFT) recommended", "Oxygen therapy evaluation if needed"]
  },
 
  "Fibrosis": {
    explanation : "Pulmonary fibrosis is scarring of lung tissue that makes it hard to breathe. The scarring makes lungs stiff and reduces oxygen supply.",
    precautions : ["Avoid dust, chemicals, and smoke", "Use oxygen therapy if prescribed", "Get regular flu and pneumonia vaccinations", "Avoid respiratory infections"],
    eat         : ["Anti-inflammatory foods", "Fruits rich in antioxidants", "Omega-3 fatty acids", "Small frequent meals"],
    avoid       : ["Smoking", "Processed and junk food", "Alcohol", "Exposure to mold or dust"],
    activity    : "Pulmonary rehabilitation exercises only. Light walking. Breathing exercises as guided by physiotherapist.",
    nextSteps   : ["Immediate pulmonologist consultation", "High-resolution CT scan required", "Regular pulmonary function monitoring"]
  },
 
  "Nodule": {
    explanation : "A lung nodule is a small round growth in the lung. Most are benign (non-cancerous), but some may need monitoring or further tests.",
    precautions : ["Do not ignore follow-up scans", "Quit smoking if you smoke", "Avoid occupational dust and chemical exposure", "Report any new symptoms immediately"],
    eat         : ["Antioxidant-rich diet", "Green leafy vegetables", "Cruciferous vegetables like broccoli", "Berries and citrus fruits"],
    avoid       : ["Smoking", "Processed meats", "Alcohol", "Junk food"],
    activity    : "Normal light activity is fine. Avoid smoking-related environments.",
    nextSteps   : ["CT scan follow-up in 3-6 months as advised", "Biopsy may be recommended if nodule grows", "PET scan if malignancy is suspected"]
  },
 
  "Mass": {
    explanation : "A lung mass is a growth larger than 3cm in the lung. It requires immediate evaluation as it may indicate a serious condition including cancer.",
    precautions : ["Do not delay medical consultation", "Avoid smoking completely", "Avoid stress — seek emotional support", "Follow all doctor instructions strictly"],
    eat         : ["Protein-rich foods to maintain strength", "Antioxidant-rich fruits and vegetables", "Whole grains", "Healthy fats like nuts and seeds"],
    avoid       : ["Smoking and alcohol", "Processed and red meats", "Sugary foods", "Junk food"],
    activity    : "Light walking as tolerated. Rest when needed. Avoid strenuous activity.",
    nextSteps   : ["Immediate oncology or pulmonology referral", "Biopsy required for diagnosis", "PET scan and CT scan recommended"]
  },
 
  "Pneumothorax": {
    explanation : "Pneumothorax is a collapsed lung where air leaks into the space between the lung and chest wall, causing sudden chest pain and breathing difficulty.",
    precautions : ["Seek emergency medical care immediately", "Do not exert yourself physically", "Avoid flying until fully recovered", "Avoid high-altitude activities"],
    eat         : ["Light and easily digestible meals", "Fruits and vegetables", "Warm fluids", "Vitamin C rich foods"],
    avoid       : ["Smoking completely", "Strenuous activity", "Flying or diving", "Heavy meals"],
    activity    : "Complete rest until treated. No physical activity until lung is fully re-expanded and doctor approves.",
    nextSteps   : ["Emergency treatment required immediately", "Chest tube insertion may be needed", "Follow-up X-ray after treatment"]
  },
 
  "Pleural_Thickening": {
    explanation : "Pleural thickening is scarring and thickening of the lining around the lungs, which can restrict breathing over time.",
    precautions : ["Avoid asbestos and industrial dust exposure", "Quit smoking", "Do breathing exercises regularly", "Monitor any changes in breathing"],
    eat         : ["Anti-inflammatory foods", "Omega-3 rich foods", "Fresh fruits and vegetables", "Turmeric and ginger"],
    avoid       : ["Smoking", "Dusty environments", "Alcohol", "Processed foods"],
    activity    : "Gentle breathing exercises. Light walking. Pulmonary rehabilitation if recommended.",
    nextSteps   : ["Pulmonologist follow-up required", "CT scan to monitor progression", "Lung function tests periodically"]
  },
 
  "Hernia": {
    explanation : "A diaphragmatic hernia is when abdominal organs push through an opening in the diaphragm into the chest cavity, affecting breathing.",
    precautions : ["Avoid heavy lifting and straining", "Eat small frequent meals", "Do not lie down immediately after eating", "Maintain healthy body weight"],
    eat         : ["Small, frequent light meals", "High-fiber foods", "Soft and easily digestible foods", "Warm water and herbal teas"],
    avoid       : ["Heavy meals", "Spicy and acidic foods", "Carbonated drinks", "Lying flat after eating"],
    activity    : "Avoid strenuous activity and heavy lifting. Light walking is fine. Core exercises only with doctor approval.",
    nextSteps   : ["Surgical consultation may be required", "Barium swallow test or CT scan recommended", "Follow up with gastroenterologist"]
  },
 
  "Infiltration": {
    explanation : "Lung infiltration means abnormal substances like fluid, pus, or cells have entered the lung tissue, usually indicating infection or inflammation.",
    precautions : ["Take complete rest", "Stay well hydrated", "Avoid cold and dusty environments", "Do not self-medicate"],
    eat         : ["Warm soups and broths", "Vitamin C rich fruits", "Garlic and ginger", "Honey with warm water"],
    avoid       : ["Cold drinks and food", "Fried and oily foods", "Dairy products", "Smoking"],
    activity    : "Complete rest. Light walking only after significant improvement.",
    nextSteps   : ["Doctor consultation immediately", "Blood tests and sputum analysis recommended", "Follow-up chest X-ray after treatment"]
  },
 
  // ── BRAIN MRI CONDITIONS ─────────────────────────────────
 
  "Glioma Tumor": {
    explanation : "Glioma is a type of tumor that grows in the brain or spinal cord. It arises from glial cells and can vary in severity from slow-growing to aggressive.",
    precautions : ["Follow all neurologist instructions strictly", "Avoid stress and get adequate sleep", "Do not ignore new or worsening headaches", "Have a caregiver or support person available"],
    eat         : ["Anti-inflammatory foods like berries and leafy greens", "Omega-3 rich foods (flaxseeds, walnuts)", "Turmeric with black pepper", "Fresh fruits and vegetables"],
    avoid       : ["Processed and packaged foods", "Sugary drinks and sweets", "Alcohol", "Red and processed meats"],
    activity    : "Light walking only. Avoid activities with risk of head injury. Meditation and relaxation techniques are helpful.",
    nextSteps   : ["Immediate neurology or neuro-oncology referral", "MRI with contrast and biopsy required", "Discuss treatment options with specialist"]
  },
 
  "Meningioma Tumor": {
    explanation : "Meningioma is a tumor that forms on the membranes surrounding the brain and spinal cord. Most are non-cancerous and slow-growing.",
    precautions : ["Monitor symptoms like headache and vision changes", "Avoid head trauma and contact sports", "Manage stress with relaxation techniques", "Regular follow-up scans are important"],
    eat         : ["Brain-healthy foods like blueberries and walnuts", "Leafy greens like spinach and kale", "Omega-3 rich foods", "Whole grains"],
    avoid       : ["Alcohol", "Processed and junk food", "High-sugar foods", "Excessive caffeine"],
    activity    : "Light daily walking. Meditation and gentle yoga. Avoid contact sports or risk of head injury.",
    nextSteps   : ["Neurosurgery consultation required", "MRI with contrast for detailed evaluation", "Watch-and-wait approach may be advised for small tumors"]
  },
 
  "Pituitary Tumor": {
    explanation : "A pituitary tumor is an abnormal growth in the pituitary gland at the base of the brain. Most are non-cancerous and affect hormone production.",
    precautions : ["Monitor vision changes carefully", "Track any hormonal symptoms (fatigue, weight change)", "Take prescribed hormone medications regularly", "Avoid stress"],
    eat         : ["Balanced diet with all food groups", "Vitamin D rich foods", "Calcium-rich foods like dairy and leafy greens", "Lean proteins"],
    avoid       : ["Alcohol", "Junk food", "Excessive sugar", "Foods that interfere with hormone balance"],
    activity    : "Light to moderate activity as tolerated. Yoga and meditation for stress management.",
    nextSteps   : ["Endocrinologist and neurosurgeon consultation", "Hormone blood tests required", "MRI of pituitary gland with contrast"]
  },
 
  "No Tumor": {
    explanation : "No brain tumor was detected in this MRI scan. The brain appears normal based on AI analysis.",
    precautions : ["Maintain a healthy lifestyle", "Get regular health checkups", "Manage stress effectively", "Protect head from injury"],
    eat         : ["Brain-healthy diet — fish, nuts, berries", "Green leafy vegetables", "Whole grains", "Plenty of water"],
    avoid       : ["Excessive alcohol", "Junk and processed food", "High sugar diet", "Smoking"],
    activity    : "Regular exercise — walking, yoga, swimming. Mental exercises like reading and puzzles are beneficial.",
    nextSteps   : ["Continue routine health checkups annually", "If symptoms persist, consult a neurologist", "Repeat MRI only if new symptoms appear"]
  },
 
  "Mild Alzheimer": {
    explanation : "Mild Alzheimer's disease is the early stage where memory lapses and confusion begin to appear but daily activities are mostly manageable.",
    precautions : ["Create a daily routine and stick to it", "Label important items and use reminders", "Stay socially active with family and friends", "Ensure home safety to prevent falls"],
    eat         : ["Mediterranean diet — olive oil, fish, nuts", "Berries and dark leafy greens", "Whole grains", "Turmeric (shown to support brain health)"],
    avoid       : ["Alcohol", "Processed and sugary foods", "Saturated fats", "Excessive salt"],
    activity    : "Daily gentle walks. Memory games and puzzles. Music therapy. Social activities with family.",
    nextSteps   : ["Neurology consultation for cognitive assessment", "PET scan or MRI may be recommended", "Cognitive therapy and memory support programs"]
  },
 
  "Moderate Alzheimer": {
    explanation : "Moderate Alzheimer's is the middle stage where memory loss worsens, and the person may need help with daily activities.",
    precautions : ["Full-time caregiver support is needed", "Secure the home environment (locks, no sharp objects)", "Maintain consistent daily routine", "Use identification bracelet in case of wandering"],
    eat         : ["Soft and easily chewable foods", "Nutrient-rich soups and smoothies", "Finger foods for easy eating", "Adequate hydration"],
    avoid       : ["Alcohol", "Choking hazards", "High-sugar foods", "Caffeine in excess"],
    activity    : "Supervised gentle walks. Music and art therapy. Simple familiar activities. Avoid overstimulating environments.",
    nextSteps   : ["Neurologist and geriatric specialist consultation", "Explore memory care programs", "Caregiver support groups are recommended"]
  },
 
  "Very Mild Alzheimer": {
    explanation : "Very mild cognitive decline is the earliest detectable stage. Minor memory lapses occur but the person functions independently.",
    precautions : ["Stay mentally active — read, solve puzzles", "Maintain social connections", "Exercise regularly for brain health", "Monitor and note any worsening symptoms"],
    eat         : ["Brain-boosting foods — blueberries, salmon, walnuts", "Leafy greens", "Whole grains", "Turmeric and olive oil"],
    avoid       : ["Alcohol", "Processed and fast food", "High sugar and salt", "Sedentary lifestyle"],
    activity    : "Regular physical exercise — walking, swimming, yoga. Mental exercises daily. Social engagement.",
    nextSteps   : ["Neurologist consultation for cognitive testing", "Annual cognitive assessments recommended", "Lifestyle modification and mental stimulation programs"]
  },
 
  "Non Demented": {
    explanation : "No signs of dementia or Alzheimer's were detected. The brain shows normal cognitive function based on AI analysis.",
    precautions : ["Maintain brain-healthy lifestyle habits", "Stay physically and mentally active", "Get adequate sleep (7-8 hours)", "Manage stress and blood pressure"],
    eat         : ["Mediterranean diet", "Fish, nuts, and berries", "Fresh fruits and vegetables", "Plenty of water"],
    avoid       : ["Excessive alcohol", "Smoking", "Junk food", "High sugar diet"],
    activity    : "Regular exercise, mental challenges, social activities, and adequate sleep for brain health.",
    nextSteps   : ["Annual health checkups", "Monitor if memory issues develop", "Consult neurologist if concerned about cognitive changes"]
  }
};
 
// ============================================================
// HELPER — Get Health Guidance
// ============================================================
function getHealthGuidance(disease) {
  if (healthGuidance[disease]) return healthGuidance[disease];
  const key = Object.keys(healthGuidance).find(
    k => k.toLowerCase() === disease.toLowerCase()
  );
  if (key) return healthGuidance[key];
  return {
    explanation : "This condition was detected by AI analysis. Please consult a medical professional for detailed information.",
    precautions : ["Rest adequately", "Stay hydrated", "Monitor your symptoms", "Avoid self-medication"],
    eat         : ["Fresh fruits and vegetables", "Whole grains", "Lean proteins", "Plenty of water"],
    avoid       : ["Junk and processed food", "Alcohol and smoking", "High sugar foods", "Excessive salt"],
    activity    : "Light walking and gentle activity as tolerated. Consult your doctor before exercising.",
    nextSteps   : ["Consult a specialist immediately", "Get recommended diagnostic tests", "Follow doctor instructions"]
  };
}
 
// ============================================================
// HELPER — Format Guidance into structured output
// ============================================================
function formatGuidance(disease, guidance) {
  return {
    explanation : guidance.explanation,
    precautions : guidance.precautions,
    food        : { eat: guidance.eat, avoid: guidance.avoid },
    activity    : guidance.activity,
    note        : "Consult a doctor before taking any medication.",
    nextSteps   : guidance.nextSteps,
    disclaimer  : "This system provides AI-generated suggestions and is not a substitute for professional medical advice. Always consult a qualified healthcare professional."
  };
}

// ============================================================
// HELPER — Check if result is No Finding / Normal / Inconclusive
// ============================================================
function isNoDisease(disease) {
  const noDiseaseList = [
    'no finding', 'no tumor', 'non demented',
    'normal', 'inconclusive', 'no disease'
  ];
  return noDiseaseList.includes(disease.toLowerCase().trim());
}

// ============================================================
// CONTROLLER 1 — Upload Image & Predict
// POST /api/upload/upload
// ============================================================
exports.uploadImage = async (req, res) => {
  try {
    const user      = req.user;
    const imagePath = req.file.path;
    const imageType = req.body.imageType || "xray";
 
    const formData = new FormData();
    formData.append("image",     fs.createReadStream(imagePath));
    formData.append("role",      user.role);
    formData.append("imageType", imageType);
 
    const pythonResponse = await axios.post(
      "http://localhost:5000/predict",
      formData,
      { headers: formData.getHeaders(), timeout: 60000 }
    );
 
    const aiResult       = pythonResponse.data;
    const guidance       = getHealthGuidance(aiResult.disease);
    const formattedGuide = formatGuidance(aiResult.disease, guidance);
 
    const result = {
      imageType     : aiResult.imageType,
      disease       : aiResult.disease,
      chancePercent : aiResult.confidence,
      riskLevel     : getRiskLevel(aiResult.confidence),
      secondOpinion : getSecondOpinion(aiResult.confidence),
      healthGuidance: formattedGuide,
      top5          : aiResult.top5    || null,
      heatmap       : aiResult.heatmap || null,
    };
 
    const uploadRecord = await Upload.create({
      userId: user.id, imagePath, imageType,
      result: result.disease, confidence: result.chancePercent
    });
 
    // const userRecord = await User.findByPk(user.id);
    // const { filePath, fileName } = await generatePDFReport(result, userRecord, uploadRecord);
    // await uploadRecord.update({ reportPath: filePath });
 
    // ---- Check if no disease detected ----
    const noDisease = isNoDisease(result.disease);

    const baseResponse = {
      success       : true,
      imageType     : result.imageType,
      disease       : result.disease,
      chancePercent : result.chancePercent,
      riskLevel     : noDisease ? null : result.riskLevel,
      secondOpinion : noDisease ? null : result.secondOpinion,
      healthGuidance: noDisease ? null : result.healthGuidance,
      noDisease     : noDisease   // NEW flag for frontend
    };

    if (user.role === "patient") return res.json(baseResponse);

    return res.json({
      ...baseResponse,
      top5   : noDisease ? null : result.top5,
      heatmap: noDisease ? null : result.heatmap
    });
 
  } catch (error) {
    console.error("[Upload Error]", error.message);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (error.code === "ECONNREFUSED") {
      return res.status(503).json({ error: "AI service offline. Run python_api/app.py" });
    }
    res.status(500).json({ error: "Prediction failed: " + error.message });
  }
};
 
// ============================================================
// CONTROLLER 2 — Upload History
// GET /api/upload/history
// ============================================================
exports.getHistory = async (req, res) => {
  try {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
 
    const { count, rows } = await Upload.findAndCountAll({
      where: { userId: req.user.id }, order: [["createdAt","DESC"]],
      limit, offset,
      attributes: ["id","imageType","result","confidence","createdAt"]
    });
 
    return res.json({
      success: true, total: count, page,
      totalPages: Math.ceil(count / limit),
      history: rows.map(r => ({
        id: r.id, imageType: r.imageType, disease: r.result,
        chancePercent: r.confidence, riskLevel: getRiskLevel(r.confidence),
        date: r.createdAt
      }))
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
};
 


