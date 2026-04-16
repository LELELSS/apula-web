"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { FaRobot, FaTimes, FaPaperPlane } from "react-icons/fa";
import styles from "./adminTutorialChat.module.css";

type Message = {
  id: string;
  sender: "bot" | "user";
  text: string;
};

const getGreeting = () => {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const quickReplies = [
  "What is this system about?",
  "Who created this?",
  "What is the thesis title?",
  "What school developed this?",
  "Who are the users of the system?",
  "What are the fire types?",
  "How do alerts work?",
  "What are the alert statuses?",
  "Where is the Dashboard page?",
  "Where is the Notification page?",
  "Where is the Users page?",
  "Where is the Request page?",
  "Where is the Truck and Team page?",
  "Where is the Assign page?",
  "Where is the Station page?",
  "Where is the Dispatch page?",
  "Where is the Reports page?",
  "Where is the Settings page?",
  "Where is the chatbot?",
];

const normalizeInput = (value: string) => {
  let text = value.toLowerCase().trim();

  const typoMap: Record<string, string> = {
    alery: "alert",
    alrt: "alert",
    alet: "alert",
    alerts: "alert",
    dispatchh: "dispatch",
    disptach: "dispatch",
    dashbord: "dashboard",
    dasboard: "dashboard",
    notif: "notification",
    notifs: "notification",
    repot: "report",
    reprt: "report",
    staton: "station",
    settngs: "settings",
    assing: "assign",
    responser: "responder",
    respoder: "responder",
    confimation: "confirmation",
    reqest: "request",
    acount: "account",
  };

  Object.entries(typoMap).forEach(([wrong, correct]) => {
    const regex = new RegExp(`\\b${wrong}\\b`, "g");
    text = text.replace(regex, correct);
  });

  return text;
};

const hasAnyKeyword = (text: string, keywords: string[]) => {
  return keywords.some((keyword) => text.includes(keyword));
};

const getBotReply = (input: string) => {
  const text = normalizeInput(input);

  const exactReplies: Record<string, string> = {
    "what is this system about?":
      "APULA is a fire detection and alert system designed to support early fire detection and a more efficient emergency response process. It uses CCTV footage, thermal imaging, and temperature sensors to identify possible fire incidents and provide timely alerts to the appropriate users and responders.",

    "who created this?": `The system was developed by Computer Science students from Cavite State University, Bacoor City Campus.

The members of the group are:
• Bides, Matthew Isaac L.
• Caliwan, Neil Yvan S.
• Fernandez, Alexander James Ian J.
• Macaranas, Kurt Baron S.`,

    "what is the thesis title?": `The title of the thesis is:

APULA: CNN-POWERED FIRE DETECTION AND ALERT SYSTEM USING CCTV FOOTAGE, THERMAL IMAGING, AND TEMPERATURE SENSORS`,

    "what school developed this?":
      "This system was developed at Cavite State University, Bacoor City Campus.",

    "who are the users of the system?": `The system has three primary user groups:

• Admin, who uses the Admin Web Application
• User, who uses the mobile application where detection-related information is displayed
• Responder, who uses the responder mobile application for emergency response operations`,

    "what are the fire types?": `The system supports three main alert types:

• Fire Alert, where the user is notified first and may confirm the alert before it is sent to the admin
• Fire Alert with No User Response, where the alert is automatically forwarded to the admin if the user does not respond
• Manual Alert, where the user directly sends an alert to the admin`,

    "how do alerts work?": `The system handles alerts through a structured response process.

A Fire Alert first notifies the user, who may confirm the alert before it is forwarded to the admin. If the user does not respond, the system automatically forwards the alert to the admin as a Fire Alert with No User Response. The user may also submit a Manual Alert directly to the admin.

Once the admin receives the alert, it appears in the Alert Modal. The admin may open a specific alert tile to review its details and dispatch an available team. The system also recommends the nearest available team to support a faster response.

After dispatch, the assigned responders receive a notification through the Responder Mobile Application and proceed to validate the incident. Once validation is completed, the admin is notified again through the confirmation section of the Alert Modal, where the incident may be formally confirmed.`,

    "what are the alert statuses?": `The alert status flow in the system is:

Pending → Dispatched → Validated → Confirmed

• Pending, the admin has received the alert and needs to dispatch a team
• Dispatched, the admin has already assigned responders to the incident
• Validated, the responders have already validated the incident and the admin needs to confirm it
• Confirmed, the admin has already confirmed the incident in the system`,

    "where is the dashboard page?": `The Dashboard page can be found on the sidebar. It provides a summarized overview of the system’s current operational status.

It displays key information such as:
• Active Fire Incidents
• Available Teams
• Available Trucks
• Responders Available
• Dispatched Responders
• Confirmed Fire Incidents for the day

It also includes a Fire Incidents Overview section with weekly, monthly, and yearly filters. The data may be viewed through line trend or bar trend graphs, and may also be downloaded through the Download Data feature.`,

    "where is the notification page?":
      "The Notification page can be found on the sidebar. It allows the admin to review both system notifications and fire-related notifications in one centralized view.",

    "where is the users page?":
      "The Users page can be found on the sidebar. It allows the admin to review the registered users of the system and use filters such as All, Admin, User, and Responder for organized user management.",

    "where is the request page?": `The Request page can be found on the sidebar. It is used for account confirmation of responder and admin applicants after registration.

The admin reviews and verifies user identities before approving access. A badge indicator is also displayed on the sidebar to show the number of pending account requests.`,

    "where is the truck and team page?":
      "The Truck and Team page can be found on the sidebar. It allows the admin to manage responder teams and trucks. On this page, the admin may add, edit, or delete team and truck records in order to maintain updated operational resources.",

    "where is the assign page?":
      "The Assign page can be found on the sidebar. It allows the admin to assign responders to their respective teams. Unassigned responders are displayed at the top of the table and are highlighted for easier identification and assignment.",

    "where is the station page?":
      "The Station page can be found on the sidebar. It allows the admin to add and edit station records associated with teams and helps organize deployment locations within the system.",

    "where is the dispatch page?": `The Dispatch page can be found on the sidebar. It is used to assign an available team to a fire incident.

Dispatching may also be initiated through the Alert Modal, which is accessible from the notification bell button. The system also recommends the nearest available team to support a faster response.`,

    "where is the reports page?":
      "The Reports page can be found on the sidebar. It allows the admin to review the details of recorded fire incidents and download reports in PDF format for documentation purposes.",

    "where is the settings page?":
      "The Settings page can be found on the sidebar. It allows the admin to update account information such as name and password for basic account management.",

    "where is the chatbot?":
      "The chatbot can be accessed through the robot icon button located below the notification bell button. It serves as an interactive assistant that provides guidance, navigation support, and system-related information.",
  };

  if (exactReplies[text]) {
    return exactReplies[text];
  }

  if (
    hasAnyKeyword(text, [
      "hello",
      "hi",
      "how are you",
      "good morning",
      "good afternoon",
      "good evening",
    ])
  ) {
    return `Good day. I am here to assist you with information and guidance regarding the APULA system.`;
  }

  if (hasAnyKeyword(text, ["status of alerts", "alert status", "statuses"])) {
    return `The alert status flow in the system is:

Pending → Dispatched → Validated → Confirmed

• Pending, the admin has received the alert and needs to dispatch a team
• Dispatched, the admin has already assigned responders to the incident
• Validated, the responders have already validated the incident and the admin needs to confirm it
• Confirmed, the admin has already confirmed the incident in the system`;
  }

  if (
    hasAnyKeyword(text, [
      "fire types",
      "alert types",
      "types of alert",
      "types of fire alert",
    ])
  ) {
    return `The system supports three main alert types:

• Fire Alert, where the user is notified first and may confirm the alert before it is sent to the admin
• Fire Alert with No User Response, where the alert is automatically forwarded to the admin if the user does not respond
• Manual Alert, where the user directly sends an alert to the admin`;
  }

  if (
    hasAnyKeyword(text, [
      "alert",
      "alert flow",
      "response flow",
      "how alerts work",
      "fire alert",
      "manual alert",
    ])
  ) {
    return `The system handles alerts through a structured response process.

A Fire Alert first notifies the user, who may confirm the alert before it is forwarded to the admin. If the user does not respond, the system automatically forwards the alert to the admin as a Fire Alert with No User Response. The user may also submit a Manual Alert directly to the admin.

Once the admin receives the alert, it appears in the Alert Modal. The admin may open a specific alert tile to review its details and dispatch an available team. The system also recommends the nearest available team to support a faster response.

After dispatch, the assigned responders receive a notification through the Responder Mobile Application and proceed to validate the incident. Once validation is completed, the admin is notified again through the confirmation section of the Alert Modal, where the incident may be formally confirmed.`;
  }

  if (hasAnyKeyword(text, ["dashboard", "dashboard page", "overview"])) {
    return `The Dashboard page can be found on the sidebar. It provides a summarized overview of the system’s current operational status.`;
  }

  if (hasAnyKeyword(text, ["notification", "notification page"])) {
    return `The Notification page can be found on the sidebar. It allows the admin to review both system notifications and fire-related notifications in one centralized view.`;
  }

  if (hasAnyKeyword(text, ["users page", "users"])) {
    return `The Users page can be found on the sidebar. It allows the admin to review the registered users of the system.`;
  }

  if (hasAnyKeyword(text, ["request", "request page"])) {
    return `The Request page can be found on the sidebar. It is used for account confirmation of responder and admin applicants after registration.`;
  }

  if (
    hasAnyKeyword(text, ["truck and team", "truck", "team", "teams", "trucks"])
  ) {
    return `The Truck and Team page can be found on the sidebar. It allows the admin to manage responder teams and trucks.`;
  }

  if (hasAnyKeyword(text, ["assign", "assign page"])) {
    return `The Assign page can be found on the sidebar. It allows the admin to assign responders to their respective teams.`;
  }

  if (hasAnyKeyword(text, ["station", "station page"])) {
    return `The Station page can be found on the sidebar. It allows the admin to add and edit station records associated with teams.`;
  }

  if (
    hasAnyKeyword(text, [
      "dispatch",
      "dispatch page",
      "alert modal",
      "alertmodal",
      "bell button",
    ])
  ) {
    return `The Dispatch page can be found on the sidebar. It is used to assign an available team to a fire incident.`;
  }

  if (hasAnyKeyword(text, ["report", "reports", "reports page"])) {
    return `The Reports page can be found on the sidebar. It allows the admin to review the details of recorded fire incidents and download reports in PDF format.`;
  }

  if (hasAnyKeyword(text, ["settings", "settings page"])) {
    return `The Settings page can be found on the sidebar. It allows the admin to update account information such as name and password.`;
  }

  if (hasAnyKeyword(text, ["chatbot", "robot", "robot icon", "assistant"])) {
    return `The chatbot can be accessed through the robot icon button located below the notification bell button.`;
  }

  return `I can assist you with information regarding the APULA system, including alerts, dispatching, user roles, system pages, navigation, and other related features.`;
};

export default function AdminTutorialChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "bot",
      text: `${getGreeting()}! I am the APULA Tutorial Assistant. I am here to provide guidance and information regarding the system, its features, and its navigation pages.`,
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo(() => quickReplies, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const now = Date.now();

    const userMessage: Message = {
      id: `user-${now}`,
      sender: "user",
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    const reply = getBotReply(trimmed);
    const typingDelay = Math.min(Math.max(reply.length * 10, 700), 1800);

    typingTimeoutRef.current = setTimeout(() => {
      const botMessage: Message = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text: reply,
      };

      setMessages((prev) => [...prev, botMessage]);
      setIsTyping(false);
    }, typingDelay);
  };

  return (
    <>
      <button
        className={styles.chatFab}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Open tutorial chatbot"
        title="APULA Tutorial Chat"
      >
        <span className={styles.tooltip}>
          {isOpen ? "Close Chat" : "Open Chat"}
        </span>
        <FaRobot />
      </button>

      {isOpen && (
        <div className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <div className={styles.chatHeaderLeft}>
              <div className={styles.botAvatar}>
                <FaRobot />
              </div>
              <div>
                <div className={styles.chatTitle}>APULA Assistant</div>
                <div className={styles.chatSubtitle}>System Guide</div>
              </div>
            </div>

            <button
              className={styles.closeBtn}
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              <FaTimes />
            </button>
          </div>

          <div className={styles.chatBody}>
            <div className={styles.quickHelpTop}>
              <div className={styles.quickHelpTitle}>Quick Help</div>

              <div className={styles.quickHelpGrid}>
                <button
                  onClick={() => sendMessage("What is this system about?")}
                >
                  About System
                </button>

                <button onClick={() => sendMessage("How do alerts work?")}>
                  Alerts
                </button>

                <button
                  onClick={() => sendMessage("What are the alert statuses?")}
                >
                  Status
                </button>

                <button
                  onClick={() => sendMessage("How do I dispatch a team?")}
                >
                  Dispatch
                </button>

                <button
                  onClick={() => sendMessage("Where is the Dashboard page?")}
                >
                  Dashboard
                </button>

                <button
                  onClick={() => sendMessage("Where is the Reports page?")}
                >
                  Reports
                </button>
              </div>
            </div>
            
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={
                  msg.sender === "bot" ? styles.botRow : styles.userRow
                }
              >
                <div
                  className={
                    msg.sender === "bot" ? styles.botBubble : styles.userBubble
                  }
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className={styles.botRow}>
                <div className={styles.typingBubble}>
                  <span className={styles.typingText}>Assistant is typing</span>
                  <span className={styles.typingDots}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className={styles.recommendedBar}>
            {suggestions.map((item) => (
              <button
                key={item}
                className={styles.chip}
                onClick={() => sendMessage(item)}
                disabled={isTyping}
              >
                {item}
              </button>
            ))}
          </div>

          <div className={styles.chatFooter}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage(input);
              }}
              placeholder="Ask about APULA..."
              className={styles.chatInput}
              disabled={isTyping}
            />

            <button
              className={styles.sendBtn}
              onClick={() => sendMessage(input)}
              aria-label="Send"
              disabled={isTyping}
            >
              <FaPaperPlane />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
