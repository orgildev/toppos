#!/bin/bash
echo "=========================================================="
echo "      STARTING TOP_POS_PRO WEBAPP SERVER (TOUCH-FIRST)"
echo "=========================================================="

# Find the local IP address
LOCAL_IP=$(hostname -I | awk '{print $1}')

if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="localhost"
fi

echo ""
echo "To take orders on your Android Tablet, connect it to the"
echo "same Wi-Fi network and open this URL in your web browser:"
echo ""
echo "👉  http://${LOCAL_IP}:3000  👈"
echo ""
echo "=========================================================="
echo "Press Ctrl+C to stop the server."
echo "----------------------------------------------------------"

cd "$(dirname "$0")/webapp"
npm run dev-network
