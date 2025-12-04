# Manual Test Cases for Shopping Redemption Feature

## Test Case 1: Successful Redemption with Sufficient Resources

**Objective:** Verify that a user can successfully redeem a shopping option when they have sufficient Ink Drops and Paper Scraps.

**Prerequisites:**
- Character sheet has at least 200 Ink Drops and 50 Paper Scraps
- Shopping page is accessible

**Steps:**
1. Navigate to the Shopping page (`/shopping.html`)
2. Verify all 5 shopping options are displayed:
   - Local Indie Bookstore
   - Large Chain Bookstore
   - Bookish Item
   - One Month of a Book Box Subscription
   - Deluxe or Special Edition
3. Locate the "Bookish Item" option (costs 25 Ink Drops, 0 Paper Scraps)
4. Note your current Ink Drops and Paper Scraps values from the Character Sheet
5. Click the "Redeem" button for "Bookish Item"
6. Verify a green success message appears: "✓ Redeemed successfully!"
7. Navigate to the Character Sheet and verify:
   - Ink Drops decreased by 25
   - Paper Scraps remained unchanged
8. Refresh the page and verify the values persist

**Expected Results:**
- Success message appears immediately after clicking Redeem
- Resources are correctly deducted
- Values persist after page refresh
- Error messages do not appear

---

## Test Case 2: Error Handling for Insufficient Resources

**Objective:** Verify that appropriate error messages are shown when the user lacks sufficient resources.

**Prerequisites:**
- Character sheet has less than 100 Ink Drops (e.g., 50 Ink Drops)
- Character sheet has less than 25 Paper Scraps (e.g., 10 Paper Scraps)

**Steps:**
1. Navigate to the Shopping page
2. Locate the "Local Indie Bookstore" option (costs 100 Ink Drops and 25 Paper Scraps)
3. Click the "Redeem" button
4. Verify a red error message appears indicating insufficient resources
5. Check the error message contains:
   - "Insufficient Ink Drops" or "Insufficient Paper Scraps"
   - Your current amount
   - The required amount
6. Verify your Ink Drops and Paper Scraps values did NOT change
7. Wait 5 seconds and verify the error message automatically disappears
8. Try redeeming "Bookish Item" (25 Ink Drops) - should work if you have at least 25 Ink Drops
9. Try redeeming "Local Indie Bookstore" again - should show error for Paper Scraps if you have enough Ink Drops but not enough Paper Scraps

**Expected Results:**
- Error message appears immediately when resources are insufficient
- Error message clearly states which resource is insufficient
- Error message shows current vs. required amounts
- Resources are NOT deducted when error occurs
- Error message auto-hides after 5 seconds
- Different error messages appear for different insufficient resources

---

## Test Case 3: Quantity Multiplier for Book Box Subscription

**Objective:** Verify that the quantity input works correctly for the Book Box Subscription option and multiplies costs appropriately.

**Prerequisites:**
- Character sheet has at least 100 Ink Drops and 100 Paper Scraps
- Shopping page is accessible

**Steps:**
1. Navigate to the Shopping page
2. Locate the "One Month of a Book Box Subscription" option
3. Verify a quantity input field is visible (other options should NOT have quantity inputs)
4. Verify the quantity input defaults to 1
5. Note your current Ink Drops and Paper Scraps values
6. Set quantity to 3
7. Click the "Redeem" button
8. Verify success message appears with "(3x)" indicator
9. Navigate to Character Sheet and verify:
   - Ink Drops decreased by 75 (25 × 3)
   - Paper Scraps decreased by 75 (25 × 3)
10. Return to Shopping page
11. Set quantity to 0 (or negative number)
12. Click "Redeem" - should use minimum quantity of 1
13. Verify resources were deducted for quantity 1, not 0

**Expected Results:**
- Quantity input only appears for Book Box Subscription
- Quantity correctly multiplies the cost (25 Ink Drops × quantity, 25 Paper Scraps × quantity)
- Success message shows the quantity redeemed
- Invalid quantities (0 or negative) default to minimum of 1
- Resources are correctly deducted based on quantity

---

## Additional Verification Points

**Cross-Page Consistency:**
- Verify that resources updated on Shopping page are immediately reflected on Character Sheet
- Verify that resources can be viewed/updated from Character Sheet and Shopping page stays in sync

**Edge Cases to Test:**
- Redeem multiple items in succession
- Try redeeming when resources are exactly equal to cost (should succeed)
- Try redeeming when resources are 1 less than required (should fail)
- Test with very large quantities (e.g., 10+ months of book box subscription)

**Browser Compatibility:**
- Test in Chrome, Firefox, and Safari (if available)
- Verify localStorage persistence works across browser sessions
- Test with browser DevTools open to monitor localStorage changes

