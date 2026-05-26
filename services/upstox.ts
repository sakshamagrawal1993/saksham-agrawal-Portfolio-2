/**
 * Upstox API Service Adapter
 * Handles OAuth authentication, token refresh, and live data fetching.
 * For now, if no credentials are provided, it throws or returns mocked data.
 */

const UPSTOX_API_BASE_URL = 'https://api.upstox.com/v2';

export class UpstoxAPI {
  private accessToken: string | null = null;
  private apiKey: string;
  private apiSecret: string;
  private redirectUri: string;

  constructor() {
    // In a real app, these would come from env vars
    this.apiKey = import.meta.env.VITE_UPSTOX_API_KEY || '';
    this.apiSecret = import.meta.env.VITE_UPSTOX_API_SECRET || '';
    this.redirectUri = import.meta.env.VITE_UPSTOX_REDIRECT_URI || '';
  }

  /**
   * Generates the Upstox OAuth login URL
   */
  getLoginUrl(): string {
    if (!this.apiKey || !this.redirectUri) {
      console.warn('Upstox API credentials not found. Cannot generate login URL.');
      return '#';
    }
    return `${UPSTOX_API_BASE_URL}/login/authorization/dialog?response_type=code&client_id=${this.apiKey}&redirect_uri=${this.redirectUri}`;
  }

  /**
   * Exchanges an authorization code for an access token
   */
  async exchangeAuthCode(code: string): Promise<string | null> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Upstox credentials missing.');
    }
    const response = await fetch(`${UPSTOX_API_BASE_URL}/login/authorization/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        code,
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      throw new Error(`Upstox auth failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    return this.accessToken;
  }

  /**
   * Fetch an Option Chain from Upstox
   */
  async getOptionChain(instrumentKey: string, expiryDate: string) {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Upstox');
    }
    const response = await fetch(`${UPSTOX_API_BASE_URL}/option/chain?instrument_key=${instrumentKey}&expiry_date=${expiryDate}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch option chain: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Mock fetching market depth (Bid/Ask quantities) and Greeks
   */
  async getAdvancedQuote(instrumentKey: string) {
    // In reality, this would hit Upstox market quote APIs.
    if (!this.accessToken) {
      throw new Error('Not authenticated with Upstox');
    }
    return {
      instrument_key: instrumentKey,
      depth: {
        buy: [{ price: 100, quantity: 50 }],
        sell: [{ price: 101, quantity: 50 }],
      },
      greeks: {
        iv: 15.2,
        delta: 0.5,
        gamma: 0.02,
        theta: -5.1,
        vega: 10.4,
      },
    };
  }
}

export const upstoxService = new UpstoxAPI();
