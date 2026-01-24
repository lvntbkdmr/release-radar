#!/bin/bash
set -e

# Generate versions.json from ReleaseRadar data
echo "Generating versions.json..."
cp data/versions.json cli/versions.json

# Build and publish CLI
cd cli
npm version patch
npm run build
npm publish --access public

echo "CLI published successfully!"
