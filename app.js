const express = require("express");
const sequelize = require('./backend/config/db');
const authRoutes = require('./backend/routes/authRoutes');
const uploadRoutes = require(".//backend/routes/uploadRoutes");

const app = express();
app.use(express.json());

app.use("/api/auth", authRoutes);//POST http://localhost:4000/api/auth/login,register
app.use("/api/upload", uploadRoutes);//POST http://localhost:4000/api/upload/upload


sequelize.sync().then(() => {
  console.log("Database connected");
  app.listen(4000, () => console.log("Server running on port 4000"));
});

const path = require('path');
app.use(express.static(path.join(__dirname, 'frontend')));

// http://localhost:4000/api/...
//Add header:
// Key          	Value
// Authorization	<JWT_TOKEN>