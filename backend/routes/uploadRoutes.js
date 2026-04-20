const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { uploadImage,getHistory} = require("../controllers/uploadController");

router.post(
  "/upload",
  auth,
  upload.single("image"),
  uploadImage
);
router.get("/history", auth, getHistory);
// router.get("/report/:id", auth, downloadReport);

module.exports = router;
