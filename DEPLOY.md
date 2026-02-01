# Deploy to get your public waitlist link

## 1. Install Firebase CLI (one time)

```bash
npm install -g firebase-tools
```

## 2. Log in (one time)

```bash
firebase login
```

## 3. Deploy

From the project folder (where `firebase.json` is):

```bash
firebase deploy --only hosting
```

## Your public URLs

After deploy you’ll see something like:

- **Main app:** `https://winner-app-1bd1c.web.app/`
- **Valoro waitlist (for social):** `https://winner-app-1bd1c.web.app/landing.html`

Use the **landing.html** link for social media so people see the Valoro waitlist page and can sign up.

## View the landing page locally

- Open `landing.html` in your browser, or  
- In the app, use the **“Share Valoro waitlist page ↗”** link in the waitlist section.
