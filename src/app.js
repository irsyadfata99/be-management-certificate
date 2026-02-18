const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const {
  errorHandler,
  notFoundHandler,
} = require("./middleware/errorMiddleware");
const { apiLimiter } = require("./middleware/rateLimitMiddleware");
const IPWhitelistMiddleware = require("./middleware/ipWhitelistMiddleware");
const routes = require("./routes");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Disposition"],
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

app.use(apiLimiter);

app.use("/api", routes);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to SaaS Certificate Management API",
    version: "1.0.0",
    documentation: "/api",
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
