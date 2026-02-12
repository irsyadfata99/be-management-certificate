/**
 * Password Validator Utility
 * Validates password strength according to security requirements
 */

class PasswordValidator {
  /**
   * Validate password strength
   * Requirements:
   * - Minimum 8 characters
   * - At least one uppercase letter
   * - At least one symbol/special character
   *
   * @param {string} password - Password to validate
   * @returns {Object} { isValid: boolean, errors: string[] }
   */
  static validate(password) {
    const errors = [];

    if (!password || typeof password !== "string") {
      return {
        isValid: false,
        errors: ["Password is required"],
      };
    }

    // Check minimum length (8 characters)
    if (password.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }

    // Check for at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }

    // Check for at least one symbol/special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push("Password must contain at least one special character (!@#$%^&* etc.)");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get password requirements as readable text
   * @returns {string[]} Array of requirement descriptions
   */
  static getRequirements() {
    return ["Minimum 8 characters", "At least one uppercase letter (A-Z)", "At least one special character (!@#$%^&* etc.)"];
  }
}

module.exports = PasswordValidator;
