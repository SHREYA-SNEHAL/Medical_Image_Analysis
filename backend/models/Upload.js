// backend/models/Upload.js
// =========================
// Change from original:
//   Added imageType column to store 'xray' or 'mri'

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Upload = sequelize.define("Upload", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },

  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  imagePath: {
    type: DataTypes.STRING,
    allowNull: false
  },

  // NEW — stores 'xray' or 'mri'
  imageType: {
    type: DataTypes.ENUM("xray", "mri"),
    allowNull: false,
    defaultValue: "xray"
  },

  result: {
    type: DataTypes.STRING  // top disease name
  },

  confidence: {
    type: DataTypes.FLOAT   // confidence percentage
  }
});

module.exports = Upload;