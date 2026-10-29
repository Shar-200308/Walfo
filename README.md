# 🔐 Walfo — Secure Student Document Vault

Walfo is a full-stack web application that lets students **securely store, manage, and access academic documents** with **OTP-based email authentication** and **facial recognition** as an additional security layer. Documents are stored on **Cloudinary** and served through a responsive Angular frontend.

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
  - [Backend Setup](#1-backend-setup-django)
  - [Frontend Setup](#2-frontend-setup-angular)
- [Environment Variables](#-environment-variables)
- [API Endpoints](#-api-endpoints)
- [Authentication Flow](#-authentication-flow)
- [Screenshots](#-screenshots)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

| Category | Details |
|---|---|
| **Authentication** | Email + OTP verification, password-based login with OTP confirmation |
| **Face Recognition** | Face descriptor matching for biometric login (Euclidean distance threshold: `0.58`) |
| **Anti-Spoofing** | Spoof attempt reporting and detection |
| **Document Management** | Upload, view (PDF preview), paginated listing, and delete documents |
| **Cloud Storage** | All documents stored on Cloudinary (images & PDFs) |
| **Password Recovery** | Forgot password flow with OTP-secured reset |
| **CGPA Calculator** | Built-in academic CGPA calculator tool |
| **Route Guards** | Token-validated route protection on all authenticated pages |
| **Rate Limiting** | API throttling — 30 req/min (anonymous), 120 req/min (authenticated) |

---

## 🛠 Tech Stack

### Frontend (`Walfo-F-master`)
| Technology | Version |
|---|---|
| Angular | 19.2 |
| TypeScript | 5.7 |
| ng2-pdf-viewer | 10.4 |
| RxJS | 7.8 |

### Backend (`Walfo-B-master`)
| Technology | Version |
|---|---|
| Django | 6.0 |
| Django REST Framework | 3.17 |
| Cloudinary | 1.45 |
| SQLite | (default) |
| python-dotenv | 1.2 |

---

## 📁 Project Structure

```
walfo/
├── Walfo-F-master/                 # Angular Frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── login-page/         # Login with OTP + face recognition
│   │   │   ├── signup-page/        # User registration with OTP
│   │   │   ├── forgot-password/    # Password recovery flow
│   │   │   ├── dashboard/          # User dashboard (protected)
│   │   │   ├── mydocument-page/    # Document listing & preview
│   │   │   ├── upload-document/    # Document upload form
│   │   │   ├── cgpa-calculator/    # CGPA calculator tool
│   │   │   ├── home/               # Landing page
│   │   │   ├── welcome-page/       # Welcome screen
│   │   │   ├── header/             # App header
│   │   │   ├── navbar/             # Navigation bar
│   │   │   ├── dialog/             # Modal dialogs
│   │   │   ├── toaster/            # Toast notifications
│   │   │   ├── page/               # Page wrapper component
│   │   │   ├── auth.service.ts     # Route guard (token validation)
│   │   │   ├── web.service.ts      # HTTP API service
│   │   │   ├── user-details.service.ts  # User state management
│   │   │   └── app-routing.module.ts    # Route definitions
│   │   └── environments/
│   │       ├── environment.ts           # Dev config
│   │       └── environment.prod.ts      # Prod config
│   ├── angular.json
│   └── package.json
│
├── Walfo-B-master/                 # Django Backend
│   ├── walfo_config/               # Django project settings
│   │   ├── settings.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── users/                      # Main app
│   │   ├── models.py               # User, CurrentWork (OTP), Students_documents
│   │   ├── views.py                # All API view functions
│   │   ├── serializers.py          # DRF serializers
│   │   ├── urls.py                 # API URL patterns
│   │   └── utils.py                # Helper utilities
│   ├── storages/                   # File storage config
│   ├── manage.py
│   ├── requirements.txt
│   ├── .env                        # Environment variables (DO NOT COMMIT)
│   └── db.sqlite3                  # SQLite database
│
└── README.md                       # ← You are here
```

---

## 📦 Prerequisites

- **Python** 3.10+
- **Node.js** 18+ & **npm** 9+
- **Angular CLI** 19 (`npm install -g @angular/cli`)
- A **Cloudinary** account (free tier works)
- A **Gmail** account with an [App Password](https://support.google.com/accounts/answer/185833) for sending OTP emails

---

## 🚀 Getting Started

### 1. Backend Setup (Django)

```bash
# Navigate to the backend directory
cd Walfo-B-master

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment variables (see section below)
# Edit the .env file with your credentials

# Run database migrations
python manage.py makemigrations
python manage.py migrate

# Create a superuser (optional)
python manage.py createsuperuser

# Start the development server
python manage.py runserver
```

The API will be available at **http://127.0.0.1:8000/**

### 2. Frontend Setup (Angular)

```bash
# Navigate to the frontend directory
cd Walfo-F-master

# Install dependencies
npm install

# Start the development server
ng serve
```

The app will be available at **http://localhost:4200/**

> **Note:** Make sure the `environment.ts` file points to your backend URL (default: `http://127.0.0.1:8000/`).

---

## 🔑 Environment Variables

Create or edit the `.env` file in `Walfo-B-master/`:

```env
# Django
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=127.0.0.1,localhost

# OTP
OTP_EXPIRY_MINUTES=10

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email (Gmail SMTP)
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
```

> ⚠️ **Never commit the `.env` file to version control.** It contains sensitive credentials.

---

## 🌐 API Endpoints

All endpoints are prefixed with `/user/`.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/user/create` | Register a new user (sends OTP to email) |
| `POST` | `/user/verify-otp` | Verify registration OTP |
| `POST` | `/user/login` | Login with email + password (sends OTP) |
| `POST` | `/user/login-verify` | Verify login OTP |
| `POST` | `/user/verify-credentials` | Validate email + password without login |
| `POST` | `/user/verify-face-otp` | Verify face descriptor and send OTP |
| `POST` | `/user/forgot-password` | Initiate password reset (sends OTP) |
| `POST` | `/user/reset-password` | Reset password with OTP |

### Documents (🔒 Authenticated)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/user/upload-document` | Upload a document (Cloudinary) |
| `GET` | `/user/get-documents?page=1&page_size=20` | Get paginated document list |
| `DELETE` | `/user/delete-document/<id>` | Delete a document |

### Security (🔒 Authenticated)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/user/validate-token` | Validate auth token |
| `GET` | `/user/search-user` | Search user by ID |
| `POST` | `/user/update-face` | Update face descriptor |
| `POST` | `/user/report-spoof` | Report a spoofing attempt |

---

## 🔄 Authentication Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Register   │────▶│  OTP Sent    │────▶│  Verify OTP  │
│  (email +    │     │  (via email) │     │  → Account   │
│   password)  │     │              │     │    Created   │
└──────────────┘     └──────────────┘     └──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Login     │────▶│  OTP Sent    │────▶│  Verify OTP  │
│  (email +    │     │  (via email) │     │  → Token     │
│   password)  │     │              │     │    Issued    │
└──────────────┘     └──────────────┘     └──────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Face Login  │────▶│ Face Match   │────▶│  OTP Verify  │
│  (capture    │     │ (descriptor  │     │  → Token     │
│   face)      │     │  comparison) │     │    Issued    │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## 🖥 Frontend Routes

| Route | Component | Auth Required |
|---|---|---|
| `/` | Home / Landing Page | ❌ |
| `/login` | Login Page | ❌ |
| `/signup` | Signup Page | ❌ |
| `/forgot-password` | Forgot Password | ❌ |
| `/dashboard` | User Dashboard | ✅ |
| `/mydocuments` | My Documents | ✅ |
| `/upload` | Upload Document | ✅ |
| `/calculator` | CGPA Calculator | ✅ |

---

## 🚢 Deployment

### Frontend
- Build for production: `ng build --configuration production`
- Deploy the `dist/` folder to **Netlify**, **Vercel**, or any static host
- Update `environment.prod.ts` with your backend URL before building

### Backend
- Set `DEBUG=False` in `.env`
- Configure a production database (PostgreSQL recommended — `psycopg2-binary` is already included)
- Use **Gunicorn** or **Daphne** as the WSGI/ASGI server
- Deploy to **Railway**, **Render**, **Heroku**, or a VPS

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📄 License

This project is open source. Feel free to use and modify as needed.

---

<p align="center">
  Built with ❤️ using <strong>Angular 19</strong> & <strong>Django 6</strong>
</p>
