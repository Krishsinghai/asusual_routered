document.addEventListener("DOMContentLoaded", function () {
    // Initialize cart on page load
    updateCart();

    // Event delegation for dynamic elements
    document.addEventListener('click', function (e) {
        // Quantity increase
        if (e.target.classList.contains('increase')) {
            const quantityElem = e.target.parentElement.querySelector('.cart-quantity');
            const newQuantity = parseInt(quantityElem.textContent) + 1;
            quantityElem.textContent = newQuantity;
            updateCart();
            updateQuantityInDatabase(quantityElem, newQuantity);
        }

        // Quantity decrease
        if (e.target.classList.contains('decrease')) {
            const quantityElem = e.target.parentElement.querySelector('.cart-quantity');
            const currentQuantity = parseInt(quantityElem.textContent);
            if (currentQuantity > 1) {
                const newQuantity = currentQuantity - 1;
                quantityElem.textContent = newQuantity;
                updateCart();
                updateQuantityInDatabase(quantityElem, newQuantity);
            }
        }

        // Remove item
        if (e.target.classList.contains('cart-remove')) {
            const cartItem = e.target.closest('.cart-item');
            cartItem.remove();
            updateCart();
            removeItemFromDatabase(e.target);
        }

        // Proceed to order
        if (e.target.id === 'proceed-to-order') {
            e.target.style.display = 'none';
            document.getElementById('shipping-form-container').style.display = 'block';
        }

        // Cancel order
        if (e.target.id === 'cancel-order') {
            document.getElementById('proceed-to-order').style.display = 'block';
            document.getElementById('shipping-form-container').style.display = 'none';
        }
    });

    // Cashfree Payment Button Handler
    document.getElementById('cashfree-payment-btn')?.addEventListener('click', async function () {
        const button = this;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        try {
            // Get shipping details
            const shippingAddress = {
                line1: document.getElementById('shipping-line1').value,
                line2: document.getElementById('shipping-line2').value,
                city: document.getElementById('shipping-city').value,
                state: document.getElementById('shipping-state').value,
                postalCode: document.getElementById('shipping-postalCode').value,
                country: document.getElementById('shipping-country').value,
                contactNumber: document.getElementById('shipping-contactNumber').value
            };

            // Validate shipping details
            if (!shippingAddress.line1 || !shippingAddress.city ||
                !shippingAddress.state || !shippingAddress.postalCode ||
                !shippingAddress.country || !shippingAddress.contactNumber) {
                throw new Error('Please fill in all required fields');
            }

            // Get cart total
            const totalAmount = parseFloat(document.querySelector(".total-line span:last-child").textContent.replace('Rs ', ''));

            // 1. Create order in database
            const orderResponse = await fetch('/orders/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shippingAddress,
                    paymentMethod: 'cashfree',
                    amount: totalAmount,
                    items: getCartItemsData()
                })
            });

            const orderData = await orderResponse.json();

            if (!orderData.success) {
                throw new Error(orderData.message || 'Failed to create order');
            }

            // 2. Initiate Cashfree payment
            const paymentResponse = await fetch('/payment/cashfree/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderData.order._id,
                    amount: totalAmount,
                    customerName: orderData.customer.name,
                    customerEmail: orderData.customer.email,
                    customerPhone: shippingAddress.contactNumber
                })
            });

            const paymentData = await paymentResponse.json();

            // 3. Redirect to Cashfree payment page
            if (paymentData.payment_link) {
                // Use Cashfree's JS SDK to open payment modal
                const cashfree = new window.Cashfree();
                cashfree.checkout({
                    paymentSessionId: paymentData.payment_link, // This is now payment_session_id
                    returnUrl: `/payment/verify?order_id=${orderId}`
                });
            } else {
                throw new Error('Failed to generate payment link');
            }
        } catch (error) {
            console.error('Payment Error:', error);
            showNotification(error.message, 'error');
            button.disabled = false;
            button.textContent = 'Pay with Cashfree';
        }
    });

    // Function to get cart items data
    function getCartItemsData() {
        return Array.from(document.querySelectorAll('.cart-item')).map(item => ({
            productId: item.dataset.productId,
            size: item.querySelector('.cart-item-size').textContent.replace('Size: ', '').trim(),
            quantity: parseInt(item.querySelector('.cart-quantity').textContent),
            price: parseFloat(item.dataset.price)
        }));
    }


    // Function to update cart totals
    function updateCart() {
        let totalItems = 0;
        let subtotal = 0;
        const shipping = parseFloat(document.querySelector('select option').textContent.match(/Rs(\d+\.\d{2})/)[1]);

        document.querySelectorAll(".cart-item").forEach(item => {
            const quantityElem = item.querySelector(".cart-quantity");
            const quantity = parseInt(quantityElem.textContent);
            const price = parseFloat(item.dataset.price);
            const itemTotalElem = item.querySelector(".item-total");

            const itemTotal = price * quantity;
            itemTotalElem.textContent = itemTotal.toFixed(2);
            totalItems += quantity;
            subtotal += itemTotal;
        });

        // Calculate discount if coupon is applied
        let discountAmount = 0;
        const couponElement = document.querySelector('.coupon-success');
        if (couponElement) {
            const couponText = couponElement.textContent;
            if (couponText.includes('%')) {
                const discountPercent = parseFloat(couponText.match(/(\d+)%/)[1]);
                discountAmount = subtotal * (discountPercent / 100);
            } else {
                const fixedDiscount = parseFloat(couponText.match(/Rs(\d+)/)[1]);
                discountAmount = Math.min(fixedDiscount, subtotal);
            }
        }

        // Update DOM elements
        document.getElementById("total-items").textContent = totalItems;
        document.getElementById("total-price").textContent = subtotal.toFixed(2);

        const discountedSubtotal = subtotal - discountAmount;
        const finalTotal = Math.max(0, discountedSubtotal + shipping);

        document.querySelector(".total-line span:last-child").textContent = `Rs ${finalTotal.toFixed(2)}`;

        const discountMessage = document.querySelector('.discount-message');
        if (discountAmount > 0) {
            if (!discountMessage) {
                const messageElement = document.createElement('p');
                messageElement.className = 'discount-message';
                messageElement.textContent = `You saved: Rs ${discountAmount.toFixed(2)}`;
                document.querySelector('.summary-total').insertBefore(messageElement, document.querySelector('.order_btn_animation'));
            } else {
                discountMessage.textContent = `You saved: Rs ${discountAmount.toFixed(2)}`;
            }
        } else if (discountMessage) {
            discountMessage.remove();
        }
    }

    // Helper functions for cart operations
    async function updateQuantityInDatabase(item, newQuantity) {
        const cartItem = item.closest('.cart-item');
        const productId = cartItem.dataset.productId;
        const size = cartItem.querySelector('.cart-item-size').textContent.replace('Size: ', '').trim();

        try {
            const response = await fetch('/cart/update-quantity', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    productId,
                    size,
                    quantity: newQuantity
                })
            });

            const data = await response.json();
            if (!data.success) {
                console.error('Error updating quantity:', data.message);
                item.textContent = parseInt(item.textContent) - (newQuantity > parseInt(item.textContent) ? -1 : 1);
                updateCart();
            }
        } catch (error) {
            console.error('Error updating quantity:', error);
            item.textContent = parseInt(item.textContent) - (newQuantity > parseInt(item.textContent) ? -1 : 1);
            updateCart();
        }
    }

    async function removeItemFromDatabase(item) {
        const cartItem = item.closest('.cart-item');
        const productId = cartItem.dataset.productId;
        const size = cartItem.querySelector('.cart-item-size').textContent.replace('Size: ', '').trim();

        try {
            const response = await fetch('/cart/remove-item', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    productId,
                    size
                })
            });

            const data = await response.json();
            if (!data.success) {
                console.error('Error removing item:', data.message);
                document.querySelector('.cart-items-section').insertBefore(cartItem, document.querySelector('.cart-back'));
                updateCart();
            }
        } catch (error) {
            console.error('Error removing item:', error);
            document.querySelector('.cart-items-section').insertBefore(cartItem, document.querySelector('.cart-back'));
            updateCart();
        }
    }

    // Notification function
    function showNotification(message, type = 'success') {
        const notificationBar = document.querySelector('.notification-bar');
        if (notificationBar) {
            notificationBar.querySelector('.notification-text').textContent = message;
            notificationBar.style.backgroundColor =
                type === 'success' ? '#4CAF50' :
                    type === 'error' ? '#f44336' : '#2196F3';
            notificationBar.style.display = 'block';

            setTimeout(() => {
                notificationBar.style.display = 'none';
            }, 5000);
        }
    }

    // Check for payment return on page load
    function checkPaymentReturn() {
        const urlParams = new URLSearchParams(window.location.search);
        const orderId = urlParams.get('order_id');

        if (orderId) {
            showNotification('Verifying your payment...', 'info');
            fetch(`/payment/verify?order_id=${orderId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        window.location.href = `/confirmation/${orderId}`;
                    } else {
                        showNotification('Payment verification failed', 'error');
                        window.location.href = '/cart';
                    }
                })
                .catch(error => {
                    console.error('Verification Error:', error);
                    showNotification('Payment verification error', 'error');
                    window.location.href = '/cart';
                });
        }
    }

    checkPaymentReturn();
});