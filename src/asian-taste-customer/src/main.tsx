import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadStripe } from '@stripe/stripe-js'
import { Elements } from '@stripe/react-stripe-js'

// Initialize Stripe with publishable key
// In production, this should come from environment variables
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_your_key_here')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Elements stripe={stripePromise}>
      <App />
    </Elements>
  </StrictMode>,
)
