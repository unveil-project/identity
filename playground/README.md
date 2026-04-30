# GitHub Identity Analysis Playground

An interactive Vue 3 application for testing the GitHub identity analyzer. Enter any GitHub username to analyze their account for automation patterns.

## Features

- 🔍 Real-time analysis of GitHub accounts
- 📊 Detailed breakdown of detected patterns and flags
- 🔐 Optional GitHub API token support for increased rate limits
- 📱 Responsive design (desktop, tablet, mobile)
- ⚡ Fast analysis with up to 200 events (2 pages × 100 items)

## Setup

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

1. Install dependencies from the root directory:

```bash
pnpm install
```

2. (Optional) Create a GitHub API token for higher rate limits:
   - Go to https://github.com/settings/tokens
   - Create a new token with `public_repo` scope
   - Copy the token

3. Create a `.env.local` file in the playground directory:

```bash
cp playground/.env.example playground/.env.local
```

4. Add your token (optional):

```env
VITE_GITHUB_TOKEN=ghp_your_token_here
```

### Running the Playground

Start the development server:

```bash
cd playground
pnpm dev
```

The app will open automatically at `http://localhost:5173`

## Usage

1. **Enter a username**: Type any GitHub username in the input field
2. **Click "Analyze"** or press Enter
3. **View results**: 
   - **Analysis Results**: Overall score and classification (organic/mixed/automation)
   - **Detected Flags**: Specific patterns that triggered points
   - **User Data**: Full GitHub profile information
   - **Events**: Up to 200 recent public events analyzed

## Rate Limits

### Without Token
- 60 requests per hour per IP
- Good for occasional testing

### With Token
- 5,000 requests per hour per token
- Recommended for frequent testing

[Create a token](https://github.com/settings/tokens) with `public_repo` scope and add it to `.env.local`.

## How It Works

1. **Fetches GitHub data**:
   - User profile information
   - Last 200 public events (2 pages of 100 items each)

2. **Analyzes patterns**:
   - Account age
   - Activity timing and frequency
   - Repository usage patterns
   - Follow/follower ratios
   - Event clustering (forks, etc.)

3. **Generates score**: 0-100 scale where:
   - **70-100**: Organic (human-like behavior)
   - **50-69**: Mixed (some suspicious patterns)
   - **0-49**: Automation (likely bot/automated account)

## Building for Production

```bash
cd playground
pnpm build
```

Output will be in `playground/dist/`

## License

MIT
