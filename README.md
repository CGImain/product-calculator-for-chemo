# Moneda calci Application

A modern web application for managing water quality analysis and reporting.

## Features

- User authentication (Sign up, Login, Forgot Password)
- Email verification
- Secure password reset with token
- JWT-based authentication
- Responsive design
- Secure file uploads
- Real-time data validation

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express.js
- **Database**: (Specify if using any database)
- **Authentication**: JWT, bcrypt
- **Email**: Nodemailer with SMTP
- **Deployment**: Render

## Prerequisites

- Node.js (v14 or higher)
- npm (v8 or higher) or yarn
- Git
- SMTP credentials for email service (e.g., Gmail, SendGrid, etc.)

## Getting Started

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/wqa-app.git
   cd wqa-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Set up environment variables**
   - Create a `.env` file in the root directory
   - Copy the variables from `.env.example` and update with your values

4. **Start the development server**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - API: http://localhost:3000/api

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
NODE_ENV=development
PORT=3000

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Email Configuration
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME="WQA App"

# SMTP Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false  # true for 465, false for other ports
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-smtp-password

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:3000
```

## Deployment

### Deploy to Render

1. Push your code to a GitHub repository
2. Connect your GitHub account to Render
3. Click "New" and select "Web Service"
4. Select your repository
5. Configure the service:
   - Name: `wqa-app`
   - Region: Choose the closest to your users
   - Branch: `main`
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Add the environment variables from your `.env` file
7. Click "Create Web Service"

## Project Structure

```
wqa-app/
├── public/                 # Static files
│   ├── login/              # Login page
│   ├── signup/             # Signup page
│   └── forgot-password/    # Forgot password page
├── server/                 # Backend code
│   ├── controllers/        # Route controllers
│   ├── routes/             # API routes
│   └── server.js           # Main server file
├── .env.example            # Example environment variables
├── .gitignore              # Git ignore file
├── package.json            # Project dependencies
└── README.md               # This file
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `GET /api/auth/verify-email` - Verify email with token

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, email support@yourdomain.com or open an issue in the GitHub repository.

Create a `.env` file in the root directory and add the following variables:

```
# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# Frontend URL
FRONTEND_URL=http://localhost:3000

# SMTP Configuration (for production)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password

# Email Configuration
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME="WQA App"
```

## Project Structure

```
wqa-main/
├── server/                 # Backend server code
│   ├── config/            # Configuration files
│   ├── controllers/        # Route controllers
│   ├── middleware/         # Custom middleware
│   ├── models/             # Database models
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── utils/              # Utility functions
│   └── index.js            # Server entry point
├── src/                    # Frontend source code
│   ├── components/         # Reusable components
│   ├── pages/              # Page components
│   ├── assets/             # Static assets
│   ├── styles/             # Global styles
│   ├── utils/              # Utility functions
│   └── App.js              # Main App component
├── .env                    # Environment variables
├── .gitignore             
├── package.json
└── README.md
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run lint` - Run linter

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, email support@example.com or open an issue in the repository.