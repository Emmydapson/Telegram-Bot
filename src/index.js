import express from 'express';
import connectDB from './config/db.js';
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import User from './models/User.js';
import crypto from 'crypto';
import cron from 'node-cron';

dotenv.config();

const app = express();

// Connect Database
connectDB();


app.get('/', (req, res) => res.send('API running'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

// Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Create a custom keyboard with options
const commandMenu = {
  reply_markup: {
    keyboard: [
      [{ text: '🎰 Spin' }, { text: '🏆 Leaderboard' }],
      [{ text: '👥 Invite Friends' }, { text: 'ℹ️ Help' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// Start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Welcome to the Spin Bot! Choose an option:', commandMenu);
});

// Function to handle the spin command
const handleSpin = async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  try {
    // Find or create the user
    let user = await User.findOne({ telegramId });
    if (!user) {
      // Generate a unique referral code using crypto
      const referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();

      // Create a new user with the generated referral code
      user = new User({
        telegramId,
        referralCode, 
        points: 0,
        spinStreak: 0,
        lastSpinDate: null,
      });

      await user.save();
    }

    const now = new Date();

    // Check spin cooldown (1 hour)
    if (user.lastSpin && now - user.lastSpin < 60 * 60 * 1000) {
      const remainingTime = Math.ceil((60 * 60 * 1000 - (now - user.lastSpin)) / (60 * 1000));
      bot.sendMessage(chatId, `You can spin again in ${remainingTime} minutes.`);
      return;
    }

    // Check if the user spun yesterday for the streak
    const lastSpinDate = user.lastSpinDate ? new Date(user.lastSpinDate) : null;
    const oneDay = 24 * 60 * 60 * 1000;

    if (lastSpinDate && now - lastSpinDate < oneDay * 2 && now - lastSpinDate > oneDay) {
      user.spinStreak += 1;
    } else if (!lastSpinDate || now - lastSpinDate >= oneDay * 2) {
      user.spinStreak = 1; // Reset the streak
    }

    user.lastSpinDate = now;

    // Reward points and streak bonus
    const pointsEarned = Math.floor(Math.random() * 100) + 1; // Random points between 1 and 100
    const streakBonus = user.spinStreak * 10;
    user.points += pointsEarned + streakBonus;
    user.lastSpin = now;

    await user.save();

    bot.sendMessage(chatId, `🎉 *Congrats!* You earned *${pointsEarned} points* and a streak bonus of *${streakBonus} points*! Your total is now *${user.points} points*.`, { parse_mode: 'Markdown' });

    // 10% chance for a bonus spin
    const allowBonusSpin = Math.random() < 0.1;
    if (allowBonusSpin) {
      bot.sendMessage(chatId, '🎁 Lucky you! You get a bonus spin! Use /spin again.');
    }

    if (user.isBanned) {
      bot.sendMessage(chatId, '🚫 You are banned from using this bot.');
      return;
    }

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, 'Something went wrong. Please try again.');
  }
};


// Function to handle the leaderboard command
const handleLeaderboard = async (msg) => {
  const chatId = msg.chat.id;

  try {
    const topUsers = await User.find().sort({ points: -1 }).limit(10); // Get top 10 users

    if (topUsers.length === 0) {
      bot.sendMessage(chatId, 'No users found.');
      return;
    }

    let leaderboardMessage = '🏆 Leaderboard:\n\n';
    topUsers.forEach((user, index) => {
      leaderboardMessage += `${index + 1}. User ID: ${user.telegramId} - Points: ${user.points}\n`;
    });

    bot.sendMessage(chatId, leaderboardMessage);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '❌ An error occurred while fetching the leaderboard.');
  }
};

// Function to handle inviting friends
const handleInviteFriends = (msg) => {
  const chatId = msg.chat.id;
  const inviteLink = `https://t.me/Raga5_bot?start=${msg.from.id}`; // Replace `your_bot_username` with your bot's username

  bot.sendMessage(chatId, `👥 Invite your friends using this link: ${inviteLink}`);
};

// Handle button clicks from custom keyboard
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '🎰 Spin') {
    await handleSpin(msg); // Directly call the spin handler
  } else if (text === '🏆 Leaderboard') {
    await handleLeaderboard(msg); // Call the leaderboard handler
  } else if (text === '👥 Invite Friends') {
    handleInviteFriends(msg); // Call the invite friends handler
  } else if (text === 'ℹ️ Help') {
    bot.sendMessage(chatId, 'Here are the available commands:\n' +
      '/spin - Spin to earn points\n' +
      '/leaderboard - View the top players\n' +
      '/invite - Invite friends to earn bonuses\n' +
      '/help - Get this list of commands');
  }
});

// Schedule a task to run once every 24 hours
cron.schedule('0 9 * * *', async () => {
  const users = await User.find();
  
  users.forEach((user) => {
    bot.sendMessage(user.telegramId, '🎉 Don\'t forget to spin today and maintain your streak!');
  });
});

const admins = [2031259199]; // Replace with your Telegram ID

const isAdmin = (telegramId) => {
  return admins.includes(telegramId);
};

// Reset points command
bot.onText(/\/resetpoints (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  // Only allow admins to use this command
  if (!isAdmin(telegramId)) {
    bot.sendMessage(chatId, '⛔ You are not authorized to use this command.');
    return;
  }

  const targetTelegramId = match[1]; // User ID to reset points

  try {
    const user = await User.findOne({ telegramId: targetTelegramId });
    if (!user) {
      bot.sendMessage(chatId, '⚠️ User not found.');
      return;
    }

    user.points = 0; // Reset points
    await user.save();

    bot.sendMessage(chatId, `✅ Points for user ${targetTelegramId} have been reset.`);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '❌ An error occurred while resetting points.');
  }
});

// Ban user command
bot.onText(/\/banuser (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  if (!isAdmin(telegramId)) {
    bot.sendMessage(chatId, '⛔ You are not authorized to use this command.');
    return;
  }

  const targetTelegramId = match[1]; // User ID to ban

  try {
    let user = await User.findOne({ telegramId: targetTelegramId });
    if (!user) {
      bot.sendMessage(chatId, '⚠️ User not found.');
      return;
    }

    user.isBanned = true; // Mark user as banned
    await user.save();

    bot.sendMessage(chatId, `🚫 User ${targetTelegramId} has been banned.`);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '❌ An error occurred while banning the user.');
  }
});

// Broadcast message command
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  if (!isAdmin(telegramId)) {
    bot.sendMessage(chatId, '⛔ You are not authorized to use this command.');
    return;
  }

  const broadcastMessage = match[1]; // Message to send

  try {
    const users = await User.find();

    users.forEach((user) => {
      bot.sendMessage(user.telegramId, `📢 Admin Message: ${broadcastMessage}`);
    });

    bot.sendMessage(chatId, '✅ Broadcast message sent to all users.');
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '❌ An error occurred while sending the broadcast.');
  }
});

// Bot stats command
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  if (!isAdmin(telegramId)) {
    bot.sendMessage(chatId, '⛔ You are not authorized to use this command.');
    return;
  }

  try {
    const totalUsers = await User.countDocuments();
    const totalPoints = await User.aggregate([
      {
        $group: {
          _id: null,
          totalPoints: { $sum: '$points' }
        }
      }
    ]);

    bot.sendMessage(chatId, `📊 Bot Statistics:\n- Total Users: ${totalUsers}\n- Total Points Distributed: ${totalPoints[0].totalPoints}`);
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '❌ An error occurred while fetching stats.');
  }
});






