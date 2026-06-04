# 🔒 Secret Vault

Secret Vault is a secure, privacy-first web application designed to protect your most sensitive data directly in your browser. Whether it's passwords, personal notes, or cryptographic keys, Secret Vault ensures your data is encrypted *before* it ever leaves your machine.

🌐 **Try it live:** [https://keane3029-lab.github.io/secret-vault/](https://keane3029-lab.github.io/secret-vault/)

---

## ✨ Features

* **Zero-Knowledge Architecture:** Your master password and encryption keys never touch a server. All cryptographic operations happen entirely in your web browser.
* **In-Browser Encryption:** Utilizes the native Web Crypto API for secure, hardware-accelerated AES-256-GCM encryption.
* **Secure Cloud Sync:** Encrypted data payloads are safely backed up to your account using Firebase, ensuring availability across devices without compromising privacy.
* **Auto-Lock Timer:** Automatically clears sensitive data from memory and signs you out after a period of browser inactivity.
* **Fully Responsive:** Optimized for both desktop and mobile web browsers.

---

## 🛠️ Tech Stack

* **Frontend:** [e.g., HTML5, CSS3, JavaScript / React]
* **Styling:** [e.g., Tailwind CSS / Plain CSS]
* **Cryptography:** Web Crypto API (SubtleCrypto)
* **Backend & Database:** Firebase (Authentication & Firestore / Realtime Database)
* **Hosting:** GitHub Pages

---

## 🔒 Security Architecture

Because this is a zero-knowledge web application, security is entirely handled on your local device before interacting with Firebase:

1. **Key Derivation:** Your master password is run through **PBKDF2** (using 100,000+ iterations and a unique salt) inside your browser to derive a 256-bit encryption key.
2. **Local Encryption:** Your data is encrypted locally using **AES-256-GCM**. 
3. **Secure Syncing:** The plain text *never* leaves your device. Firebase securely manages your user account authentication and stores the resulting **encrypted ciphertext** over HTTPS. Even if the database is accessed, the data remains unreadable without your master password.

> ⚠️ **Important:** Because Firebase only stores encrypted data payloads and we do not store your master password on any server, there is no "Forgot Master Password" feature. If you lose your master password, your stored data is permanently unrecoverable.

---

## 🚀 Local Development

If you want to clone this repository and run the website locally on your machine:

### Prerequisites
* [Node.js](https://nodejs.org/) (if using a framework/bundler) or a local live server extension

### Setup Instructions
1. **Clone the repository:**
```bash
   git clone [https://github.com/keane3029-lab/secret-vault.git](https://github.com/keane3029-lab/secret-vault.git)
   cd secret-vault
Set up Firebase Environment Variables:
If your project uses environment variables for the Firebase config, create a .env file in the root directory and add your keys:

Code snippet
   FIREBASE_API_KEY=your_api_key
   FIREBASE_AUTH_DOMAIN=your_auth_domain
   FIREBASE_PROJECT_ID=your_project_id
   # Add other required Firebase keys here
Install dependencies: (Skip if using vanilla HTML/JS)

Bash
   npm install
Run the website locally:

Bash
   npm start
🤝 Contributing
Contributions are welcome! If you'd like to help improve the security or features of Secret Vault:

Fork the Project

Create your Feature Branch (git checkout -b feature/AmazingFeature)

Commit your Changes (git commit -m 'Add some AmazingFeature')

Push to the Branch (git push origin feature/AmazingFeature)

Open a Pull Request

📞 Contact
Project Link: https://github.com/keane3029-lab/secret-vault
