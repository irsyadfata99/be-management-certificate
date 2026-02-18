class PasswordValidator {
  static validate(password) {
    const errors = [];

    if (!password || typeof password !== "string") {
      return {
        isValid: false,
        errors: ["Password is required"],
      };
    }

    if (password.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }

    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push(
        "Password must contain at least one special character (!@#$%^&* etc.)",
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  static getRequirements() {
    return [
      "Minimum 8 characters",
      "At least one uppercase letter (A-Z)",
      "At least one special character (!@#$%^&* etc.)",
    ];
  }
}

module.exports = PasswordValidator;
