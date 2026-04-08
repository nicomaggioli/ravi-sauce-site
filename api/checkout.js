// Stripe Checkout session creator.
// Receives a cart from the browser, looks up real prices from products.json
// (so customers can't tamper with prices client-side), and returns a Stripe
// Checkout URL for the browser to redirect to.

import Stripe from 'stripe';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Load authoritative product data from disk (never trust client prices)
    const productsPath = join(process.cwd(), 'products.json');
    const products = JSON.parse(readFileSync(productsPath, 'utf-8'));
    const productById = Object.fromEntries(products.map(p => [p.id, p]));

    const line_items = items.map(item => {
      const p = productById[item.id];
      if (!p) throw new Error(`Unknown product: ${item.id}`);
      const qty = Math.max(1, Math.min(99, parseInt(item.qty) || 1));
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: p.name,
            description: item.size && item.size !== 'One Size' ? `Size: ${item.size}` : undefined,
            images: p.imgs && p.imgs[0] ? [`${req.headers.origin || 'https://ravisauce.com'}/${p.imgs[0]}`] : undefined,
          },
          unit_amount: Math.round(p.price * 100),
        },
        quantity: qty,
      };
    });

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: { amount: 800, currency: 'usd' },
            display_name: 'Standard Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 5 },
              maximum: { unit: 'business_day', value: 10 },
            },
          },
        },
      ],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: err.message });
  }
}
