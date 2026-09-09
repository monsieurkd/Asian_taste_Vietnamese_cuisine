#!/bin/bash

# Payment Integration Test Script with Mock Gateway Support
# Usage: ./tests/test-payment-mock.sh [cash|card|card-full|status|capture|refund]

API_BASE="${API_BASE:-http://localhost:5070/api}"
PAYLOAD_DIR="$(dirname "$0")/payloads"

echo "================================"
echo "Payment Integration Test Script (Mock Gateway)"
echo "API: $API_BASE"
echo "================================"

# Create payloads directory if it doesn't exist
mkdir -p "$PAYLOAD_DIR"

# Function to check API health
check_api() {
    echo -e "\n[1] Checking API health..."
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5070/api/dev/db/status" 2>/dev/null)

    if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "000" ]; then
        echo "✓ API is running (HTTP $RESPONSE)"
        return 0
    else
        echo "✗ API is not responding (HTTP $RESPONSE)"
        echo "  Start API with: cd src/AsianTaste.API && dotnet run"
        return 1
    fi
}

# Function to check mock gateway status
check_mock_status() {
    echo -e "\n[1.1] Checking Mock Gateway status..."
    RESPONSE=$(curl -s "http://localhost:5070/api/dev/payment/config" 2>/dev/null)

    if echo "$RESPONSE" | grep -q '"useMockGateway":[^,]*true'; then
        echo "✓ MOCK GATEWAY ENABLED - Card payments will use mock"
        return 0
    else
        echo "⚠ Mock gateway not enabled - Card payments will try real Lightspeed API"
        echo "  To enable mock: Set 'Payment:UseMockGateway' = true in appsettings.json"
        return 0  # Don't fail, just warn
    fi
}

# Function to create a test order
create_order() {
    echo -e "\n[2] Creating test order..."

    ORDER_RESPONSE=$(curl -s -X POST "$API_BASE/orders" \
        -H "Content-Type: application/json" \
        -d '{
            "orderType": 0,
            "customerName": "Test Customer",
            "customerEmail": "test@example.com",
            "customerPhone": "5551234",
            "items": [
                {"menuItemId": 1, "quantity": 2}
            ],
            "notes": "Test order for payment",
            "paymentNonce": "mock_nonce_test"
        }')

    # Save response for debugging
    echo "$ORDER_RESPONSE" > "$PAYLOAD_DIR/order_response.json"

    # Try both 'orderId' and 'id' as the API might use either
    ORDER_ID=$(echo "$ORDER_RESPONSE" | grep -o '"orderId":[0-9]*' | head -1 | cut -d':' -f2)
    if [ -z "$ORDER_ID" ]; then
        ORDER_ID=$(echo "$ORDER_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
    fi
    ORDER_NUMBER=$(echo "$ORDER_RESPONSE" | grep -o '"orderNumber":"[^"]*"' | cut -d'"' -f4)

    if [ -n "$ORDER_ID" ]; then
        echo "✓ Order created successfully"
        echo "  Order ID: $ORDER_ID"
        echo "  Order Number: $ORDER_NUMBER"
        echo "$ORDER_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$ORDER_RESPONSE"
        return 0
    else
        echo "✗ Failed to create order"
        echo "  Response: $ORDER_RESPONSE"
        return 1
    fi
}

# Function to initiate payment
initiate_payment() {
    local ORDER_ID=$1
    local METHOD_TYPE=$2  # 0 = Card, 1 = Cash
    local METHOD_NAME=$3

    echo -e "\n[3] Initiating $METHOD_NAME payment for Order #$ORDER_ID..."

    PAY_RESPONSE=$(curl -s -X POST "$API_BASE/payments/initiate" \
        -H "Content-Type: application/json" \
        -d "{
            \"orderId\": $ORDER_ID,
            \"paymentMethodType\": $METHOD_TYPE
        }")

    echo "$PAY_RESPONSE" > "$PAYLOAD_DIR/payment_response.json"

    SUCCESS=$(echo "$PAY_RESPONSE" | grep -o '"success":[^,}]*' | cut -d':' -f2 | tr -d ' ')
    PAYMENT_ID=$(echo "$PAY_RESPONSE" | grep -o '"paymentId":"[^"]*"' | cut -d'"' -f4)
    STATUS=$(echo "$PAY_RESPONSE" | grep -o '"paymentStatus":[^,}]*' | cut -d':' -f2 | tr -d ' ')

    if [ "$SUCCESS" = "true" ]; then
        echo "✓ $METHOD_NAME payment initiated successfully"
        echo "  Payment ID: $PAYMENT_ID"
        echo "  Status: $STATUS (0=Pending, 1=Processing)"
        echo "$PAY_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$PAY_RESPONSE"
        echo "$PAYMENT_ID" > "$PAYLOAD_DIR/last_payment_id.txt"
        return 0
    else
        echo "✗ Payment initiation failed"
        echo "  Response: $PAY_RESPONSE"
        return 1
    fi
}

# Function to get payment status
get_payment_status() {
    local PAYMENT_ID=$1

    echo -e "\n[4] Getting payment status for $PAYMENT_ID..."

    STATUS_RESPONSE=$(curl -s -X GET "$API_BASE/payments/$PAYMENT_ID/status")

    echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
}

# Function to capture payment
capture_payment() {
    local PAYMENT_ID=$1

    echo -e "\n[5] Capturing payment $PAYMENT_ID (simulating pickup)..."

    CAPTURE_RESPONSE=$(curl -s -X POST "$API_BASE/payments/$PAYMENT_ID/capture" \
        -H "Content-Type: application/json" \
        -d '{"amount": 1700}')

    SUCCESS=$(echo "$CAPTURE_RESPONSE" | grep -o '"success":[^,}]*' | cut -d':' -f2 | tr -d ' ')

    if [ "$SUCCESS" = "true" ]; then
        echo "✓ Payment captured successfully"
        echo "$CAPTURE_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$CAPTURE_RESPONSE"
        return 0
    else
        echo "✗ Payment capture failed"
        echo "  Response: $CAPTURE_RESPONSE"
        return 1
    fi
}

# Function to test refund
test_refund() {
    local PAYMENT_ID=$1

    echo -e "\n[6] Testing refund for payment $PAYMENT_ID..."

    REFUND_RESPONSE=$(curl -s -X POST "$API_BASE/payments/$PAYMENT_ID/refund" \
        -H "Content-Type: application/json" \
        -d '{}')

    SUCCESS=$(echo "$REFUND_RESPONSE" | grep -o '"success":[^,}]*' | cut -d':' -f2 | tr -d ' ')

    if [ "$SUCCESS" = "true" ]; then
        echo "✓ Refund processed successfully"
        echo "$REFUND_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$REFUND_RESPONSE"
        return 0
    else
        echo "✗ Refund failed"
        echo "  Response: $REFUND_RESPONSE"
        return 1
    fi
}

# Main test flow
main() {
    case "${1:-help}" in
        cash)
            check_api || exit 1
            sleep 1

            if create_order; then
                sleep 1
                initiate_payment "$ORDER_ID" 1 "CASH"
            fi
            ;;
        card)
            check_api || exit 1
            check_mock_status  # Just warn, don't fail
            sleep 1

            if create_order; then
                sleep 1
                initiate_payment "$ORDER_ID" 0 "CARD"
            fi
            ;;
        card-full)
            check_api || exit 1
            check_mock_status
            sleep 1

            if create_order; then
                sleep 1
                if initiate_payment "$ORDER_ID" 0 "CARD"; then
                    if [ -f "$PAYLOAD_DIR/last_payment_id.txt" ]; then
                        PAYMENT_ID=$(cat "$PAYLOAD_DIR/last_payment_id.txt")
                        sleep 1
                        get_payment_status "$PAYMENT_ID"
                        sleep 1
                        capture_payment "$PAYMENT_ID"
                    fi
                fi
            fi
            ;;
        status)
            if [ -f "$PAYLOAD_DIR/last_payment_id.txt" ]; then
                PAYMENT_ID=$(cat "$PAYLOAD_DIR/last_payment_id.txt")
                get_payment_status "$PAYMENT_ID"
            else
                echo "No previous payment found. Run 'cash' or 'card' test first."
            fi
            ;;
        capture)
            if [ -f "$PAYLOAD_DIR/last_payment_id.txt" ]; then
                PAYMENT_ID=$(cat "$PAYLOAD_DIR/last_payment_id.txt")
                capture_payment "$PAYMENT_ID"
            else
                echo "No previous payment found. Run 'cash' or 'card' test first."
            fi
            ;;
        refund)
            if [ -f "$PAYLOAD_DIR/last_payment_id.txt" ]; then
                PAYMENT_ID=$(cat "$PAYLOAD_DIR/last_payment_id.txt")
                test_refund "$PAYMENT_ID"
            else
                echo "No previous payment found. Run 'cash' or 'card' test first."
            fi
            ;;
        help|--help|-h)
            echo "Usage: $0 [cash|card|card-full|status|capture|refund]"
            echo ""
            echo "Commands:"
            echo "  cash       - Test cash payment flow"
            echo "  card       - Test card payment initiation"
            echo "  card-full  - Test complete card payment flow (initiate + status + capture)"
            echo "  status     - Check last payment status"
            echo "  capture    - Capture last payment (mark as paid)"
            echo "  refund     - Refund last payment"
            echo ""
            echo "Environment Variables:"
            echo "  API_BASE - Override API base URL (default: http://localhost:5070/api)"
            exit 0
            ;;
        *)
            echo "Unknown command: $1"
            echo "Run '$0 help' for usage"
            exit 1
            ;;
    esac

    echo -e "\n================================"
    echo "Test complete!"
    echo "================================"
}

main "$@"
