"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  BetPosition,
  BetAmount,
  Player,
  SessionResult,
} from "../utils/aurumDemo";

interface TradingChartProps {
  onTradeComplete?: (tradeData: {
    id: number;
    position: string;
    amount: number;
    entryPrice: number;
    exitPrice?: number;
    profit: number;
    time: string;
    isWin?: boolean;
  }) => void;
  onPlayersChange?: (activePlayers: number) => void;
}

export default function TradingChart({
  onTradeComplete,
  onPlayersChange,
}: TradingChartProps) {
  const HOUSE_BANK_USER_ID = "ks72m74heawkx1p7n524fbtnt97mj6y1";
  // State from MarketChart
  const [currentPrice, setCurrentPrice] = useState(1.0825);
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [direction, setDirection] = useState(1);
  const chartRef = useRef<HTMLDivElement>(null);

  // State from PriceSimulator
  const currentUser = useQuery(api.aurum.getCurrentUser);
  const serverBalance = currentUser?.balance || 0;
  const withdrawFunds = useMutation(api.aurum.withdrawFunds);
  const depositFunds = useMutation(api.aurum.depositFunds);
  const adminDepositFunds = useMutation(api.aurum.adminDepositFunds);
  const adminWithdrawFunds = useMutation(api.aurum.adminWithdrawFunds);
  const [betAmount, setBetAmount] = useState<BetAmount>(1);
  const [sessionPlayers, setSessionPlayers] = useState<Player[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(
    null,
  );
  const [userPlayerId] = useState(
    `user-${Math.random().toString(36).substring(2, 9)}`,
  );
  const [sessionTime] = useState(30); // seconds for demo
  const [countDown, setCountDown] = useState(30);
  const [isTrading, setIsTrading] = useState(false);

  const [activeTrade, setActiveTrade] = useState<{
    id: number;
    position: string;
    amount: number;
    entryPrice: number;
    startTime: number;
    x: number;
    y: number;
  } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [, setHoverInfo] = useState<{
    visible: boolean;
    x: number;
    y: number;
    price: number;
    index: number;
    time: string;
  } | null>(null);

  // Add this state to track which direction has more bets
  const [betImbalance, setBetImbalance] = useState<"buy" | "sell" | "equal">(
    "equal",
  );

  // Add this new state to track trade path points
  const [tradePath, setTradePath] = useState<
    { x: number; y: number; price: number; time: number }[]
  >([]);

  // Define completeTrade with useCallback to avoid dependency issues
  const completeTrade = useCallback(async () => {
    if (!activeTrade) return;
    setIsTrading(false);

    // Determine the bet imbalance - which side has more bets
    const finalBuyVotes = sessionPlayers
      .filter((p) => p.position === "buy")
      .reduce((sum, p) => sum + p.amount, 0);

    const finalSellVotes = sessionPlayers
      .filter((p) => p.position === "sell")
      .reduce((sum, p) => sum + p.amount, 0);

    // The key principle: the side with FEWER bets should win
    const winningPosition =
      finalBuyVotes === finalSellVotes
        ? "neutral" // Neutral if equal bets on both sides
        : finalBuyVotes > finalSellVotes
          ? "sell" // If more people bet UP, DOWN should win
          : "buy"; // If more people bet DOWN, UP should win

    // IMPORTANT: Force the final price movement to match the winning side
    // This ensures the visual representation matches the actual winners
    const finalPrice =
      winningPosition === "neutral"
        ? currentPrice
        : winningPosition === "buy"
          ? currentPrice + 0.0005 // Force line up if BUY wins
          : currentPrice - 0.0005; // Force line down if SELL wins

    setCurrentPrice(finalPrice);
    setPriceHistory((prev) => [...prev.slice(0, -1), finalPrice]);

    if (tradePath.length > 0) {
      // Update the last point in trade path to reflect final direction
      setTradePath((prev) => {
        const updatedPath = [...prev];
        if (updatedPath.length > 0) {
          updatedPath[updatedPath.length - 1] = {
            ...updatedPath[updatedPath.length - 1],
            price: finalPrice,
          };
        }
        return updatedPath;
      });
    }

    // Calculate winners and losers
    const winners = sessionPlayers.filter(
      (player) =>
        player.position === winningPosition || winningPosition === "neutral",
    );
    const losers = sessionPlayers.filter(
      (player) =>
        player.position !== winningPosition && winningPosition !== "neutral",
    );

    // Calculate total losing bet amount
    const losingTotal = losers.reduce((sum, loser) => sum + loser.amount, 0);
    const winningTotal = winners.reduce(
      (sum, winner) => sum + winner.amount,
      0,
    );

    // Distribute the pot
    const houseFee = losingTotal * 0.08; // 8% house fee
    const winnersPot = losingTotal - houseFee;

    // Calculate each winner's share
    const winnersWithProfits = winners.map((winner) => {
      const profitShare =
        winningPosition === "neutral"
          ? 0 // No profit in case of a neutral result
          : (winner.amount / winningTotal) * winnersPot;

      const totalReturn = winner.amount + profitShare;
      const roi = profitShare > 0 ? (profitShare / winner.amount) * 100 : 0;

      return {
        playerId: winner.id,
        id: winner.id,
        position: winner.position,
        amount: winner.amount,
        initialBet: winner.amount, // Required field
        profit: profitShare,
        totalReturn: totalReturn, // Required field
        roi: roi, // Required field (Return on Investment percentage)
      };
    });

    // Generate session result
    const result: SessionResult = {
      winners: winnersWithProfits,
      losers: losers.map((loser) => ({
        ...loser,
        playerId: loser.id,
        initialBet: loser.amount,
        totalReturn: 0,
        roi: -100, // Lost everything, so ROI is -100%
        profit: 0, // Add missing profit property required by PlayerResult type
      })),
      winningPosition: winningPosition as BetPosition,
      isNeutral: winningPosition === "neutral",
      players: sessionPlayers,
      buyTotal: finalBuyVotes,
      sellTotal: finalSellVotes,
      isFoul: false,
      timestamp: Date.now(),
    };

    // Update balance based on result
    const userWon = result.winners.some((w) => w.playerId === userPlayerId);
    if (userWon && !result.isNeutral) {
      const userWinAmount =
        result.winners.find((w) => w.playerId === userPlayerId)?.profit || 0;
      console.log("User won! Depositing:", activeTrade.amount + userWinAmount);
      try {
        await depositFunds({
          amount: activeTrade.amount + userWinAmount,
          paymentMethod: "card-usd",
        });
        console.log("Deposit successful for winner");
      } catch (error) {
        console.error("Deposit failed for winner:", error);
      }
      // Debit house by the payout amount (stake + profit)
      try {
        await adminWithdrawFunds({
          userId: HOUSE_BANK_USER_ID,
          amount: activeTrade.amount + userWinAmount,
          paymentMethod: "card-usd",
        });
        console.log("House debited successfully for winner");
      } catch (error) {
        console.error("House debit failed for winner:", error);
      }
    } else if (result.isNeutral) {
      console.log("Neutral result! Refunding stake:", activeTrade.amount);
      try {
        await depositFunds({
          amount: activeTrade.amount,
          paymentMethod: "card-usd",
        });
        console.log("Refund successful for neutral");
      } catch (error) {
        console.error("Refund failed for neutral:", error);
      }
      // Neutral: return player stake; also debit house to return stake back
      try {
        await adminWithdrawFunds({
          userId: HOUSE_BANK_USER_ID,
          amount: activeTrade.amount,
          paymentMethod: "card-usd",
        });
        console.log("House debited successfully for neutral");
      } catch (error) {
        console.error("House debit failed for neutral:", error);
      }
    } else {
      // User lost - no action needed since stake was already deducted when placing bet
      // House keeps the stake (already credited when bet was placed)
      console.log("User lost - stake already deducted. No refund needed.");
    }

    // Small delay to ensure UI updates properly
    await new Promise((resolve) => setTimeout(resolve, 100));

    const endPrice = finalPrice; // Use our forced final price

    // Send trade data to parent component if callback exists
    if (onTradeComplete) {
      onTradeComplete({
        id: activeTrade.id,
        position: activeTrade.position,
        amount: activeTrade.amount,
        entryPrice: activeTrade.entryPrice,
        exitPrice: endPrice,
        profit: userWon
          ? winnersWithProfits.find((w) => w.playerId === userPlayerId)
              ?.profit || 0
          : -activeTrade.amount,
        time: new Date().toLocaleTimeString(),
        isWin: userWon && !result.isNeutral,
      });
    }

    // Set session result for display
    setSessionResult(result);

    // Show visual result
    setTimeout(() => {
      showTradeResult();
    }, 100);

    // Clear for next round
    setTimeout(() => {
      setActiveTrade(null);
      setSessionPlayers([]);
      setSessionResult(null);
      setTradePath([]);
    }, 5000);
  }, [
    activeTrade,
    sessionPlayers,
    currentPrice,
    tradePath,
    userPlayerId,
    depositFunds,
    adminDepositFunds,
    adminWithdrawFunds,
    onTradeComplete,
  ]);

  // Generate initial price history (5 minute simulation with more data points)
  useEffect(() => {
    const initialHistory: number[] = [];
    let price = 1.0825;
    let tempDirection = Math.random() > 0.5 ? 1 : -1;

    // Generate 20 points for 5 minutes (assuming 1 second intervals)
    for (let i = 0; i < 100; i++) {
      if (Math.random() < 0.15) {
        tempDirection *= -1;
      }
      // More realistic forex pip movements
      const change = tempDirection * (0.00005 + Math.random() * 0.00015);
      price += change;
      // Set realistic bounds for EUR/USD
      price = Math.max(1.0815, Math.min(1.0838, price));
      initialHistory.push(price);
    }

    setPriceHistory(initialHistory);
    setCurrentPrice(initialHistory[initialHistory.length - 1]);
  }, []);

  // Simulate price movement (will be overridden during betting rounds)
  useEffect(() => {
    if (priceHistory.length === 0) return;

    const timer = setInterval(() => {
      // Only move the price randomly when not in an active betting round
      if (!isTrading) {
        // Update price with zigzag movement (smaller movements for forex)
        setCurrentPrice((prev) => {
          if (Math.random() < 0.15) {
            setDirection(-direction);
          }

          // More realistic forex pip movements
          const volatility = 0.00005 + Math.random() * 0.0001;
          const newPrice = prev + direction * volatility;
          const boundedPrice = Math.max(1.0815, Math.min(1.0838, newPrice));

          // Update history
          setPriceHistory((oldHistory) => {
            const newHistory = [...oldHistory, boundedPrice];
            if (newHistory.length > 100) {
              return newHistory.slice(newHistory.length - 100);
            }
            return newHistory;
          });

          return boundedPrice;
        });
      } else if (isTrading && activeTrade) {
        // During active trading, move the price based on bet imbalance
        setCurrentPrice((prev) => {
          // If more people bet UP, move the line DOWN (line moves opposite to majority)
          const moveDirection =
            betImbalance === "buy" ? -1 : betImbalance === "sell" ? 1 : 0;

          // If equal bets, make very small random movements
          const volatility =
            betImbalance === "equal"
              ? (Math.random() - 0.5) * 0.00005
              : 0.00008 + Math.random() * 0.00012;

          // EDGE CASE FIX: Check if we're at or near boundaries and ensure continued movement
          if (prev <= 1.0816 && moveDirection < 0) {
            // If at lower bound and trying to go lower, force a slight upward movement
            return prev + (0.0001 + Math.random() * 0.00008);
          } else if (prev >= 1.0837 && moveDirection > 0) {
            // If at upper bound and trying to go higher, force a slight downward movement
            return prev - (0.0001 + Math.random() * 0.00008);
          }

          const newPrice = prev + moveDirection * volatility;

          // Still keep overall limits but with a small margin to prevent flatlines
          const boundedPrice = Math.max(1.0815, Math.min(1.0838, newPrice));

          // Update history
          setPriceHistory((oldHistory) => {
            const newHistory = [...oldHistory, boundedPrice];
            if (newHistory.length > 100) {
              return newHistory.slice(newHistory.length - 100);
            }
            return newHistory;
          });

          // Update trade path
          setTradePath((prevPath) => [
            ...prevPath,
            {
              x: chartRef.current ? chartRef.current.clientWidth : 0,
              y: 0, // Will be calculated in draw function
              price: boundedPrice,
              time: Date.now(),
            },
          ]);

          return boundedPrice;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [direction, priceHistory, isTrading, activeTrade, betImbalance]);

  // Timer countdown for active trades
  useEffect(() => {
    if (!isTrading || !activeTrade) return;

    const timer = setInterval(() => {
      const elapsedTime = Math.floor(
        (Date.now() - activeTrade.startTime) / 1000,
      );
      const remaining = sessionTime - elapsedTime;

      if (remaining <= 0) {
        clearInterval(timer);
        completeTrade();
      } else {
        setCountDown(remaining);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isTrading, activeTrade, sessionTime, completeTrade]);

  // Update bet imbalance whenever sessionPlayers changes
  useEffect(() => {
    if (sessionPlayers.length === 0) {
      setBetImbalance("equal");
      // Report player count to parent (safely handle the callback)
      onPlayersChange?.(0);
      return;
    }

    const buyTotal = sessionPlayers
      .filter((p) => p.position === "buy")
      .reduce((sum, p) => sum + p.amount, 0);

    const sellTotal = sessionPlayers
      .filter((p) => p.position === "sell")
      .reduce((sum, p) => sum + p.amount, 0);

    if (buyTotal > sellTotal) {
      setBetImbalance("buy");
    } else if (sellTotal > buyTotal) {
      setBetImbalance("sell");
    } else {
      setBetImbalance("equal");
    }

    // Report player count to parent (safely)
    onPlayersChange?.(sessionPlayers.length);
  }, [sessionPlayers, onPlayersChange]); // Always include onPlayersChange in the dependency array

  // Handle mouse movement over chart
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartRef.current || priceHistory.length === 0) return;

    const chartRect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - chartRect.left;
    const width = chartRect.width;

    // Calculate the price index corresponding to the mouse position
    const priceIndex = Math.min(
      priceHistory.length - 1,
      Math.max(0, Math.floor((x / width) * priceHistory.length)),
    );

    // Get the price at this index
    const price = priceHistory[priceIndex];

    // Find the y-coordinate for this price
    const minPrice = Math.min(...priceHistory) - 0.0001;
    const maxPrice = Math.max(...priceHistory) + 0.0001;
    const range = maxPrice - minPrice;
    const height = chartRect.height;
    const y = height - ((price - minPrice) / range) * height;

    // Show hover info at this position
    setHoverInfo({
      visible: true,
      x,
      y,
      price,
      index: priceIndex,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  };

  const handleMouseLeave = () => {
    setHoverInfo(null);
  };

  // Update the draw logic in the useEffect
  useEffect(() => {
    if (!chartRef.current || priceHistory.length === 0) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const chartElement = chartRef.current;
    const width = chartElement.clientWidth;
    const height = chartElement.clientHeight;

    canvas.width = width;
    canvas.height = height;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";

    // Clear any existing canvas
    const existingCanvas = chartElement.querySelector("canvas");
    if (existingCanvas) {
      chartElement.removeChild(existingCanvas);
    }

    chartElement.appendChild(canvas);

    // Draw chart
    ctx.clearRect(0, 0, width, height);

    // Find min/max for scaling
    const minPrice = Math.min(...priceHistory) - 0.0001;
    const maxPrice = Math.max(...priceHistory) + 0.0001;
    const range = maxPrice - minPrice;

    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(59, 130, 246, 0.1)");
    gradient.addColorStop(1, "rgba(59, 130, 246, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw area under the line
    ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
    ctx.beginPath();

    // Start at bottom left
    ctx.moveTo(0, height);

    // Draw line to first point
    const firstY = height - ((priceHistory[0] - minPrice) / range) * height;
    ctx.lineTo(0, firstY);

    // Draw history points
    priceHistory.forEach((price, index) => {
      const x = (width * index) / priceHistory.length;
      const y = height - ((price - minPrice) / range) * height;
      ctx.lineTo(x, y);
    });

    // Complete area
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Draw price line
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Draw line
    priceHistory.forEach((price, index) => {
      const x = (width * index) / priceHistory.length;
      const y = height - ((price - minPrice) / range) * height;

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw current price point
    const lastX = (width * (priceHistory.length - 1)) / priceHistory.length;
    const lastY = height - ((currentPrice - minPrice) / range) * height;

    ctx.fillStyle =
      priceHistory[priceHistory.length - 1] >
      priceHistory[priceHistory.length - 2]
        ? "#10b981" // green
        : "#ef4444"; // red

    ctx.beginPath();
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw entry point if there's an active trade
    if (activeTrade) {
      const entryX =
        (width * (priceHistory.length - (sessionTime - countDown))) /
        priceHistory.length;
      const entryY =
        height - ((activeTrade.entryPrice - minPrice) / range) * height;

      // Draw a line from the entry point to the current price
      ctx.strokeStyle = "#f59e0b80"; // semi-transparent orange
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(entryX, entryY);
      ctx.lineTo(lastX, lastY);
      ctx.stroke();

      // Draw entry point marker
      ctx.fillStyle = "#f59e0b"; // orange color
      ctx.beginPath();
      ctx.arc(entryX, entryY, 6, 0, Math.PI * 2);
      ctx.fill();

      // Draw entry price label with better visibility
      ctx.fillStyle = "#10b981"; // green color
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "left";

      // Add background for better text visibility
      ctx.fillStyle = "#ffffff90"; // semi-transparent white
      ctx.fillRect(entryX + 8, entryY - 20, 100, 20);

      // Draw text
      ctx.fillStyle = "#10b981"; // green color
      ctx.fillText(
        `Entry: ${activeTrade.entryPrice.toFixed(4)}`,
        entryX + 10,
        entryY - 10,
      );
    }

    // Draw price labels
    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(currentPrice.toFixed(4), width - 10, 20);
  }, [priceHistory, currentPrice, activeTrade, countDown, sessionTime]);

  // Function to place a bet - renamed for clarity
  const placeBet = async (position: BetPosition) => {
    if (isTrading || serverBalance < betAmount) return;

    // Remove any existing bets by this player
    const filteredPlayers = sessionPlayers.filter((p) => p.id !== userPlayerId);

    // Add the new bet
    const userBet: Player = {
      id: userPlayerId,
      position,
      amount: betAmount,
    };

    // Generate random number of AI players (0-15)
    const aiPlayers = generateRandomAIPlayers(0, 15, position);
    setSessionPlayers([...filteredPlayers, ...aiPlayers, userBet]);
    try {
      console.log("Attempting to withdraw funds:", betAmount);
      const withdrawResult = await withdrawFunds({
        amount: betAmount,
        paymentMethod: "card-usd",
      });
      console.log("Withdraw result:", withdrawResult);
      // Credit house with the stake
      try {
        await adminDepositFunds({
          userId: HOUSE_BANK_USER_ID,
          amount: betAmount,
          paymentMethod: "card-usd",
        });
        console.log("House credited successfully");
      } catch (error) {
        console.error("House credit failed:", error);
      }
    } catch (e) {
      console.error("Withdraw funds failed:", e);
      alert("Failed to place bet. Please try again.");
      return; // stop if withdrawal fails
    }
    setIsTrading(true);

    // Initialize trade path with entry point
    const entryPrice = currentPrice;
    const newActiveTrade = {
      id: Date.now(),
      position,
      amount: betAmount,
      entryPrice,
      startTime: Date.now(),
      x: chartRef.current ? chartRef.current.clientWidth : 0,
      y: 0, // Will be calculated in the draw function
    };

    setActiveTrade(newActiveTrade);
    setTradePath([
      {
        x: chartRef.current ? chartRef.current.clientWidth : 0,
        y: 0,
        price: entryPrice,
        time: Date.now(),
      },
    ]);

    // Start countdown to session end
    startSessionCountdown();

    // Report new player count immediately (safely)
    onPlayersChange?.(1 + aiPlayers.length); // User + AI players
  };

  // Helper function to generate AI players
  const generateRandomAIPlayers = (
    min: number,
    max: number,
    userPosition: BetPosition,
  ) => {
    const playerCount = min + Math.floor(Math.random() * (max - min + 1));
    const aiPlayers: Player[] = [];

    for (let i = 0; i < playerCount; i++) {
      // Generate random position - make it somewhat biased against the user's position
      // to create more interesting gameplay (55-45 bias)
      const position =
        Math.random() < 0.55
          ? userPosition === "buy"
            ? "sell"
            : "buy"
          : userPosition === "buy"
            ? "buy"
            : "sell";

      // Generate random bet amount (either 1 or 2)
      const amount = Math.random() < 0.7 ? 1 : 2;

      aiPlayers.push({
        id: `ai-${i}-${Math.random().toString(36).substring(2, 9)}`,
        position,
        amount,
      });
    }

    return aiPlayers;
  };

  // Function to start countdown timer
  const startSessionCountdown = () => {
    setCountDown(sessionTime);
  };

  // Add this function to show trade results visually
  const showTradeResult = () => {
    if (!chartRef.current || !sessionResult) return;

    // Get canvas context
    const chartElement = chartRef.current;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Setup canvas dimensions
    const width = chartElement.clientWidth;
    const height = chartElement.clientHeight;
    canvas.width = width;
    canvas.height = height;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";

    // Add an identifier class to track this canvas
    canvas.className = "trade-result-overlay";

    // Clear any existing result overlay
    const existingOverlay = chartElement.querySelector(".trade-result-overlay");
    if (existingOverlay) {
      chartElement.removeChild(existingOverlay);
    }

    // Add to chart
    chartElement.appendChild(canvas);

    // Draw trade result
    if (tradePath.length > 1) {
      const startPoint = tradePath[0];
      const endPoint = tradePath[tradePath.length - 1];
      const priceHistory = [...tradePath.map((point) => point.price)];
      const minPrice = Math.min(...priceHistory) - 0.0001;
      const maxPrice = Math.max(...priceHistory) + 0.0001;
      const range = maxPrice - minPrice;

      // Draw entry point
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(
        startPoint.x,
        height - ((startPoint.price - minPrice) / range) * height,
        6,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // Draw exit point
      const userResult = sessionResult.winners.find(
        (p) => p.playerId === userPlayerId,
      );
      const isWin = userResult !== undefined;
      ctx.fillStyle = isWin ? "#10b981" : "#ef4444";
      ctx.beginPath();
      ctx.arc(
        endPoint.x,
        height - ((endPoint.price - minPrice) / range) * height,
        8,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // Draw connecting line
      ctx.strokeStyle = isWin ? "#10b981" : "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(
        startPoint.x,
        height - ((startPoint.price - minPrice) / range) * height,
      );

      for (let i = 1; i < tradePath.length; i++) {
        const point = tradePath[i];
        const y = height - ((point.price - minPrice) / range) * height;
        ctx.lineTo(point.x, y);
      }
      ctx.stroke();

      // Add text labels
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#f59e0b";
      ctx.fillText(
        "Entry",
        startPoint.x + 10,
        height - ((startPoint.price - minPrice) / range) * height - 10,
      );

      ctx.fillStyle = isWin ? "#10b981" : "#ef4444";
      ctx.fillText(
        isWin ? "WIN" : "LOSS",
        endPoint.x + 10,
        height - ((endPoint.price - minPrice) / range) * height - 10,
      );
    }

    // Automatically remove after 5 seconds
    setTimeout(() => {
      const overlay = chartElement.querySelector(".trade-result-overlay");
      if (overlay) {
        chartElement.removeChild(overlay);
      }
    }, 5000);
  };

  // Calculate time remaining for active trade
  const getTimeRemaining = () => {
    if (!activeTrade) return 0;

    const elapsed = Math.floor((Date.now() - activeTrade.startTime) / 1000);
    return Math.max(0, sessionTime - elapsed);
  };

  // Calculate price difference for display - simplified
  const priceTrend =
    priceHistory.length > 1 && currentPrice > priceHistory[0]
      ? "rising"
      : "falling";
  const isPositive = priceTrend === "rising";

  // Toggle expanded view
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Add this new function to create a "price movement" indicator
  const getPriceMovementIndicator = () => {
    if (priceHistory.length < 10) return null;

    // Get the last 10 price points to determine recent trend
    const recentPrices = priceHistory.slice(-10);
    const firstPrice = recentPrices[0];
    const lastPrice = recentPrices[recentPrices.length - 1];
    const priceDiff = lastPrice - firstPrice;

    // Calculate volatility (standard deviation)
    const avg =
      recentPrices.reduce((sum, p) => sum + p, 0) / recentPrices.length;
    const variance =
      recentPrices.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) /
      recentPrices.length;
    const volatility = Math.sqrt(variance);

    // Determine trend strength based on price difference relative to volatility
    const strength = Math.abs(priceDiff) / volatility;

    if (strength < 0.5) return "Sideways";
    if (priceDiff > 0) {
      return strength > 1.5 ? "Strong Uptrend" : "Mild Uptrend";
    } else {
      return strength > 1.5 ? "Strong Downtrend" : "Mild Downtrend";
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-blue-900 overflow-hidden h-full flex flex-col">
      {/* Chart header */}
      <div className="bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-blue-900 p-3 flex justify-between items-center">
        <div>
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Your Balance
          </div>
          <div className="text-2xl font-bold text-slate-800 dark:text-white">
            ${serverBalance.toFixed(2)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Current Price
          </div>
          <div
            className={`text-xl font-bold flex items-center ${
              isPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {isPositive ? (
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            )}
            {currentPrice.toFixed(4)}
          </div>
        </div>
        <div>
          <button
            onClick={toggleExpanded}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={isExpanded ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Chart container */}
      <div
        ref={chartRef}
        className={`relative overflow-hidden bg-slate-50 dark:bg-gray-900 ${
          isExpanded ? "h-[calc(100%-200px)]" : "h-[400px]"
        }`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Timer display for active trade */}
        {isTrading && (
          <div className="absolute top-4 right-4 bg-slate-800/80 text-white px-3 py-1 rounded">
            {getTimeRemaining()}s
          </div>
        )}

        {/* Simplified Session info overlay
        <div className="absolute top-4 left-4 bg-slate-800/90 text-white px-3 py-2 rounded text-xs">
          <div className="font-bold mb-1">Current Round</div>
          <div>
            UP Predictions: $
            {sessionPlayers
              .filter((p) => p.position === "buy")
              .reduce((sum, p) => sum + p.amount, 0)}
          </div>
          <div>
            DOWN Predictions: $
            {sessionPlayers
              .filter((p) => p.position === "sell")
              .reduce((sum, p) => sum + p.amount, 0)}
          </div>
          <div>Players: {sessionPlayers.length}</div>
          {isTrading && <div className="mt-1">Ends in: {countDown}s</div>}
        </div> */}

        {/* Bet direction prediction 
        {isTrading && betImbalance !== "equal" && (
          <div className="absolute bottom-4 right-4 bg-slate-800/80 text-white px-3 py-1 rounded text-xs">
            Prediction: Line will go {betImbalance === "buy" ? "DOWN" : "UP"}
            <span className="ml-1 opacity-75">(opposite of majority)</span>
          </div>
        )}*/}

        {/* Simplified Session result overlay */}
        {sessionResult && (
          <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg max-w-xs text-center">
              <div className="text-xl font-bold mb-2">
                {sessionResult.isNeutral
                  ? "It's a Tie! Same bets on both sides."
                  : `${sessionResult.winningPosition === "buy" ? "UP" : "DOWN"} Wins!`}
              </div>
              {!sessionResult.isNeutral && (
                <div className="mb-3">
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {sessionResult.winningPosition === "buy"
                      ? "Line went UP"
                      : "Line went DOWN"}
                  </div>

                  {/* User's result */}
                  {sessionResult.winners.find(
                    (p) => p.playerId === userPlayerId,
                  ) ? (
                    <div className="mt-3 text-green-500 font-bold text-lg">
                      You WON $
                      {sessionResult.winners
                        .find((p) => p.playerId === userPlayerId)
                        ?.profit.toFixed(2)}
                      !
                    </div>
                  ) : (
                    <div className="mt-3 text-red-500 font-bold text-lg">
                      {sessionResult.isNeutral
                        ? "You got your capital back."
                        : "You lost your capital."}
                    </div>
                  )}
                </div>
              )}
              <div className="text-sm mb-1">
                {sessionResult.isNeutral
                  ? "Everyone gets their money back!"
                  : "Winners share 92% of losing capital."}
              </div>
            </div>
          </div>
        )}

        {/* Update the return JSX to include the trend indicator */}
        {isTrading && (
          <div className="absolute bottom-20 left-4 bg-slate-800/90 text-white px-3 py-2 rounded text-xs">
            <div className="font-bold mb-1">Market Trend</div>
            <div className="flex items-center">
              <span className={isPositive ? "text-green-400" : "text-red-400"}>
                {isPositive ? "↗️" : "↘️"} {getPriceMovementIndicator()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Controls container */}
      <div className="flex flex-col">
        {/* Bet amount selection */}
        <div className="p-3 border-t border-slate-200 dark:border-blue-900">
          <div>
            <label className="text-sm text-slate-600 dark:text-slate-400 mb-2 block">
              How Much to Play?
            </label>
            <div className="flex space-x-2">
              {[1, 2].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setBetAmount(amount as BetAmount)}
                  className={`px-3 py-1 rounded text-sm ${
                    betAmount === amount
                      ? "bg-blue-600 text-white dark:bg-blue-700"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  } ${isTrading ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={isTrading}
                >
                  ${amount}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Trading buttons */}
        <div className="grid grid-cols-2 gap-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-800">
          <button
            className={`bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded ${
              isTrading ? "opacity-50 cursor-not-allowed" : ""
            }`}
            onClick={() => placeBet("buy")}
            disabled={isTrading || serverBalance < betAmount}
          >
            BET UP ↑
          </button>
          <button
            className={`bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded ${
              isTrading ? "opacity-50 cursor-not-allowed" : ""
            }`}
            onClick={() => placeBet("sell")}
            disabled={isTrading || serverBalance < betAmount}
          >
            BET DOWN ↓
          </button>
        </div>

        {/* Stats footer */}
        <div className="grid grid-cols-4 gap-2 p-3 border-t border-slate-200 dark:border-blue-900 bg-slate-50 dark:bg-gray-900 text-xs">
          <div className="text-center">
            <div className="text-blue-500 dark:text-blue-300">ROUND</div>
            <div className="font-medium text-slate-800 dark:text-white">
              {isTrading ? `${countDown}s left` : "Ready to bet!"}
            </div>
          </div>

          <div className="text-center">
            <div className="text-blue-500 dark:text-blue-300">MY BET</div>
            <div className="font-medium text-slate-800 dark:text-white">
              ${betAmount}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
