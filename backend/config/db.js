// require("dotenv").config();
require("dotenv").config({ path: __dirname + "/../.env" });
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "mysql"
  }
);
console.log(process.env.DB_USER);
console.log(process.env.DB_PASSWORD);
module.exports = sequelize;
