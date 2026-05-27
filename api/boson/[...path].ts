import type { VercelRequest, VercelResponse } from '@vercel/node';
import { proxyRequest } from '../_proxy';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return proxyRequest(req, res, {
    target: 'https://hackathon.boson.ai',
    forwardHeaders: ['authorization'],
  });
}
