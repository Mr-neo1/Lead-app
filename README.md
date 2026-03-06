# Lead Manager - Contact Outreach Platform

A modern lead management and contact outreach platform built with Next.js 14, featuring role-based access control, country-based categorization, and team management.

## Features

- **Admin Dashboard**: Manage contacts, partners, and areas
- **Partner Dashboard**: View and update assigned contacts (multilingual: EN/ES)
- **Role-based Access Control**: Admin and partner roles
- **Contact Management**: Add, edit, delete, and bulk import contacts
- **Country Code Categorization**: Auto-categorize contacts by phone country code
- **Import/Export**: CSV, Excel, JSON import with column mapping
- **Bulk Assignment**: Assign contacts by selection, country, or area
- **Magic Link Auth**: Optional email-based admin authentication
- **Session Management**: Auto-timeout with warning

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Database**: Turso (LibSQL/SQLite)
- **ORM**: Drizzle ORM
- **Authentication**: JWT + Magic Links
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Turso account (https://turso.tech)

### Installation

```bash
cd nextjs-app
npm install
```

### Environment Setup

Create a `.env.local` file:

```env
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token
JWT_SECRET=your-super-secret-jwt-key-at-least-32-chars
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Default Credentials

- **Username**: admin
- **Password**: admin123

## Project Structure

```
nextjs-app/
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # Authentication endpoints
│   │   ├── users/        # User management
│   │   ├── areas/        # Area management
│   │   └── contacts/     # Contact management
│   ├── admin/            # Admin dashboard
│   ├── worker/           # Worker dashboard
│   ├── login/            # Login page
│   ├── layout.js         # Root layout
│   ├── page.js           # Home page (redirects)
│   └── globals.css       # Global styles
├── lib/
│   ├── database.js       # NeDB database setup
│   ├── auth.js           # Auth utilities
│   └── api-client.js     # Frontend API client
├── context/
│   └── AuthContext.js    # Auth context provider
└── data/                 # Database files (auto-created)
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Users (Admin only)
- `GET /api/users` - Get all workers
- `POST /api/users` - Create worker
- `PUT /api/users/[id]` - Update worker
- `DELETE /api/users/[id]` - Delete worker

### Areas
- `GET /api/areas` - Get all areas
- `POST /api/areas` - Create area (admin)
- `PUT /api/areas/[id]` - Update area (admin)
- `DELETE /api/areas/[id]` - Delete area (admin)

### Contacts
- `GET /api/contacts` - Get contacts
- `GET /api/contacts/stats` - Get statistics
- `POST /api/contacts` - Create contact (admin)
- `PUT /api/contacts/[id]` - Update contact
- `DELETE /api/contacts/[id]` - Delete contact (admin)
- `POST /api/contacts/import` - Import CSV (admin)
- `POST /api/contacts/bulk-assign` - Bulk assign (admin)
- `GET /api/contacts/recategorize` - Preview country categorization
- `POST /api/contacts/recategorize` - Execute country categorization

## Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/Lead-app.git
git push -u origin main
```

### 2. Create Turso Database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# Create database
turso db create leadapp

# Get database URL
turso db show leadapp --url

# Get auth token
turso db tokens create leadapp
```

### 3. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "New Project"
3. Import your `Lead-app` repository
4. Set **Root Directory** to `nextjs-app`
5. Add Environment Variables:
   - `TURSO_DATABASE_URL` = your Turso URL
   - `TURSO_AUTH_TOKEN` = your Turso token
   - `JWT_SECRET` = a secure 32+ character secret
   - `NEXT_PUBLIC_APP_URL` = your Vercel deployment URL
6. Click "Deploy"

### 4. After Deployment

1. Visit your deployed URL
2. Login with: `admin` / `admin123`
3. **Change the admin password immediately** in the settings

## Security Notes

- Always change the default admin password
- Use a strong JWT_SECRET (minimum 32 characters)
- Enable HTTPS (automatic on Vercel)
- Consider enabling magic link authentication for admin

## License

MIT
