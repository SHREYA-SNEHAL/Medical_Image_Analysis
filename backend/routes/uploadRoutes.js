const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { uploadImage } = require("../controllers/uploadController");

router.post(
  "/upload",
  auth,
  upload.single("image"),
  uploadImage
);

module.exports = router;
