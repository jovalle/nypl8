set shell := ["bash", "-euo", "pipefail", "-c"]

# Show available recipes.
default:
  @just --list

# One-time setup: install dependencies and build the dashboard.
setup:
  node scripts/setup.mjs

# Start the tool: DMV lookup backend + dashboard on http://127.0.0.1:5360
run:
  npm start

# Run the dashboard in development mode (hot reload) on port 5360.
# Pass --host 0.0.0.0 to expose it to your local network.
dev *args:
  npm run dev -- {{args}}

# Run unit and backend tests.
test:
  npm test
