
const mongoose = require('mongoose');
const SpinCode = require('./models/SpinCode');
require('dotenv').config({ path: '.env' });

// Use native fetch (Node 18+) or fallback to http if needed, but Mongoose 9 requires Node 16+ which has fetch? 
// Actually Node 18+ has fetch properly. 
// If fetch fails, we'll see. Using http is safer for generic node scripts but more verbose.
// Let's try fetch first.

const TEST_CODE = 'VERIFY-REDEMPTION-TEST-001';
const TEST_USER = 'VerificationBot';

async function runVerification() {
    console.log(">>> Starting Verification Process...");

    // 1. Connect to DB
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log(">>> Connected to MongoDB");
    } catch (err) {
        console.error("!!! DB Connection Failed:", err);
        process.exit(1);
    }

    // 2. Clean up old test code if exists
    await SpinCode.deleteOne({ code: TEST_CODE });
    console.log(">>> Cleaned up any existing test code");

    // 3. Create fresh code
    const newCode = new SpinCode({
        code: TEST_CODE,
        status: 'active',
        note: 'Created by Verification Script'
    });
    await newCode.save();
    console.log(`>>> Created Test Code: ${TEST_CODE}`);

    // 4. Call Spin API
    console.log(">>> Calling API /api/game/spin...");

    try {
        const response = await fetch('http://localhost:3000/api/game/spin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: TEST_CODE,
                username: TEST_USER
            })
        });

        const data = await response.json();
        console.log(">>> API Response Status:", response.status);
        console.log(">>> API Response Body:", JSON.stringify(data, null, 2));

        if (response.status !== 200 || !data.ok) {
            console.error("!!! API Spin Failed");
            await cleanup();
            process.exit(1);
        }

    } catch (err) {
        console.error("!!! API Call Failed (Is server running?):", err.message);
        await cleanup();
        process.exit(1);
    }

    // 5. Verify Database State
    const updatedCode = await SpinCode.findOne({ code: TEST_CODE });
    console.log(">>> Checking Code Status in DB...");
    console.log(`>>> Current Status: ${updatedCode.status}`);
    console.log(`>>> Used By: ${updatedCode.usedByUsername}`);
    console.log(`>>> Prize: ${updatedCode.prize}`);

    let success = true;

    if (updatedCode.status !== 'used') {
        console.error("!!! FAIL: Code status is NOT 'used'");
        success = false;
    } else {
        console.log(">>> PASS: Code status is 'used'");
    }

    if (updatedCode.usedByUsername !== TEST_USER) {
        console.error("!!! FAIL: usedByUsername mismatch");
        success = false;
    } else {
        console.log(">>> PASS: usedByUsername matches");
    }

    // 6. Final Report
    console.log("\n==============================");
    if (success) {
        console.log("✅ VERIFICATION SUCCESSFUL");
        console.log("System correctly redeems codes and marks them as used.");
    } else {
        console.log("❌ VERIFICATION FAILED");
    }
    console.log("==============================");

    await cleanup();
    process.exit(success ? 0 : 1);
}

async function cleanup() {
    await SpinCode.deleteOne({ code: TEST_CODE });
    await mongoose.connection.close();
}

runVerification();
