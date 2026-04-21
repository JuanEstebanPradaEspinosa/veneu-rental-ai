# Slack App Setup Guide for Allusion Booking System

## Step 1: Create the Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: "Allusion Venue Booking"
4. Pick your workspace
5. Click "Create App"

## Step 2: Configure OAuth Permissions

1. Go to "OAuth & Permissions" in the sidebar
2. Under "Bot Token Scopes", add:
   - chat:write
   - chat:write.public
   - channels:read
3. Click "Install to Workspace"
4. Authorize the app
5. Copy the "Bot User OAuth Token" (starts with xoxb-)
6. Add it to backend/.env as SLACK_BOT_TOKEN

## Step 3: Configure Interactivity

1. Go to "Interactivity & Shortcuts" in the sidebar
2. Enable "Interactivity"
3. Set Request URL to: https://YOUR_DOMAIN/api/slack/actions
4. Save changes

## Step 4: Get Signing Secret

1. Go to "Basic Information"
2. Under "App Credentials", copy "Signing Secret"
3. Add it to backend/.env as SLACK_SIGNING_SECRET

## Step 5: Create the #venue-bookings Channel

1. In Slack, create a channel called #venue-bookings
2. Invite the Allusion Venue Booking bot to the channel
3. Make sure SLACK_APPROVAL_CHANNEL=#venue-bookings in backend/.env

## Step 6: Test

Submit a test booking through the booking page.
You should see a Slack message in #venue-bookings with Approve/Reject/Follow-up buttons.
