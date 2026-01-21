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

  result: {
    type: DataTypes.STRING
  },

  confidence: {
    type: DataTypes.FLOAT
  }
});

module.exports = Upload;
