import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';
import nudgeSoundFile from './sounds/nudge.mp3';
import twemoji from 'twemoji';
import './App.css';
import 'font-awesome/css/font-awesome.min.css';

const WelcomeScreen = ({ onFindPartner }) => (
  <div className="welcome-screen">
    <h2>Yabancılarla görüntülü sohbet edin!</h2>
    <p>Omegle tarzında rastgele eşleştirme</p>
    <button 
      className="find-partner-btn"
      onClick={onFindPartner}
    >
      🔍 Eşleştirme Ara
    </button>
  </div>
);

const Twemoji = ({ text }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      // Önceki içeriği temizle
      containerRef.current.innerHTML = '';
      
      // Yeni içeriği parse edip ekle
      const parsedHtml = twemoji.parse(text, {
        folder: '72x72',
        ext: '.png',
        className: 'emoji-img',
        base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/'
      });
      containerRef.current.innerHTML = parsedHtml;
    }
  }, [text]); // Sadece text değiştiğinde çalış

  return <div className="message-text-inner" ref={containerRef} />;
};

function App() {
  const socket = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [partnerInfo, setPartnerInfo] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isRemoteVideoMuted, setRemoteVideoMuted] = useState(false);
  const [isVideoBlurred, setIsVideoBlurred] = useState(true);
  const [isShaking, setIsShaking] = useState(false);
  const [buzzCooldown, setBuzzCooldown] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [showBuzzNotification, setShowBuzzNotification] = useState(false);
  const [remoteVolume, setRemoteVolume] = useState(1);
  const messagesListRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const searchActiveRef = useRef(false);
  const partnerRef = useRef(null);
  const nudgeSound = useRef(null);
  const emojiPickerRef = useRef();

  const SERVER_URL = process.env.NODE_ENV === 'production' 
    ? 'https://chat-sitesi-deneme-backend.onrender.com' 
    : 'http://localhost:5000';

  const scrollToBottom = () => {
    if (messagesListRef.current) {
        messagesListRef.current.scrollTop = messagesListRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const playNudgeSound = useCallback(() => {
    if (nudgeSound.current) {
      nudgeSound.current.currentTime = 0;
      nudgeSound.current.play().catch(e => console.error("Ses çalma hatası:", e));
    }
  }, []);

  const stopMediaTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
      remoteVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const resetState = useCallback(() => {
    setIsSearching(false);
    setPartner(null);
    setPartnerInfo(null);
    setMessages([]);
    setRemoteVideoMuted(false);
    setIsVideoBlurred(true);
    setShowEmojiPicker(false);
    setMessageInput('');
    searchActiveRef.current = false;
  }, []);

  const cleanupPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  }, []);
  
  const handleDisconnectFlow = useCallback(() => {
    cleanupPeerConnection();
    stopMediaTracks();
    resetState();
  }, [cleanupPeerConnection, stopMediaTracks, resetState]);


  const findPartner = useCallback(async (initialMessage = null) => {
    searchActiveRef.current = true;
    setIsSearching(true);
    if (initialMessage) {
      setMessages([{ message: initialMessage, from: 'system', timestamp: new Date().toISOString() }]);
    } else {
      setMessages([]);
    }
    setPartner(null);
    setPartnerInfo(null);
    if (!localStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (searchActiveRef.current) {
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        } else {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
      } catch (err) {
        alert("Kamera ve mikrofon erişimi gerekli. Lütfen izin verip tekrar deneyin.");
        resetState();
        return;
      }
    } else if (localVideoRef.current && !localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (socket.current && searchActiveRef.current) {
      socket.current.emit('findPartner');
    }
  }, [resetState]);
  
  const handleFindPartnerClick = useCallback(() => {
    if (isSearching || partner) return;
    findPartner();
  }, [isSearching, partner, findPartner]);

  const handleCancelSearch = useCallback(() => {
    searchActiveRef.current = false;
    if (socket.current) socket.current.emit('cancelSearch');
    handleDisconnectFlow();
  }, [handleDisconnectFlow]);
  
  const handleNext = useCallback(() => {
    if (partner && socket.current) {
      socket.current.emit('disconnectPartner');
      cleanupPeerConnection();
      findPartner("Partnerinle bağlantı kesildi. Yeni birini arıyorum...");
    }
  }, [partner, cleanupPeerConnection, findPartner]);

  const handleDisconnect = useCallback(() => {
    if (partner && socket.current) socket.current.emit('leaveChat');
    handleDisconnectFlow();
  }, [partner, handleDisconnectFlow]);

  useEffect(() => {
    partnerRef.current = partner;
  }, [partner]);
  
  useEffect(() => {
    socket.current = io(SERVER_URL);
    nudgeSound.current = new Audio(nudgeSoundFile);

    const pcConfig = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    };

    const initializePeerConnection = () => {
      if (peerConnectionRef.current) {
        console.warn("Mevcut peer connection zaten var. Yenisi oluşturulmuyor.");
        return peerConnectionRef.current;
      }
      
      const pc = new RTCPeerConnection(pcConfig);

      pc.onicecandidate = (event) => {
        if (event.candidate && socket.current) {
          socket.current.emit('iceCandidate', { candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.volume = remoteVolume;
          setRemoteVideoMuted(event.streams[0].getAudioTracks()[0]?.enabled === false);
        }
      };

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          try {
            pc.addTrack(track, localStreamRef.current);
          } catch (e) {
            console.error("Track eklenirken hata:", e);
          }
        });
      } else {
        console.error("Yerel stream (kamera/mikrofon) bulunamadığı için track eklenemedi.");
      }
      
      peerConnectionRef.current = pc;
      return pc;
    };

    socket.current.on('connect', () => setIsConnected(true));
    socket.current.on('disconnect', () => {
      setIsConnected(false);
      handleDisconnectFlow();
    });
    socket.current.on('updateUserCount', setUserCount);

    socket.current.on('receiveMessage', (data) => {
        console.log('[CLIENT DEBUG] receiveMessage olayı alındı:', data);
        setMessages(prev => [...prev, { 
            message: data.message, 
            senderId: data.senderId,
            timestamp: new Date().toISOString() 
        }]);
    });

    socket.current.on('partnerFound', async (data) => {
      searchActiveRef.current = false;
      setIsSearching(false);
      setPartner(data.partnerId);
      setPartnerInfo(data.partnerInfo);
      setMessages([{ message: `Partnerin bulundu! (${data.partnerInfo.countryName})`, from: 'system', timestamp: new Date().toISOString() }]);
      
      const pc = initializePeerConnection();

      if (data.initiator) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.current.emit('offer', { offer });
        } catch(e) {
            console.error("Offer oluşturma/set etme hatası:", e);
        }
      }
    });

    socket.current.on('offer', async (data) => {
      const pc = initializePeerConnection();
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.current.emit('answer', { answer });
      } catch(e) {
          console.error("Answer oluşturma/set etme hatası:", e);
      }
    });

    socket.current.on('answer', async (data) => {
      if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'stable') {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) {
          console.error("Remote description (answer) set etme hatası:", e);
        }
      }
    });

    socket.current.on('iceCandidate', (data) => {
      if (peerConnectionRef.current && data.candidate) {
        try {
          peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("ICE adayı eklenirken hata:", e);
        }
      }
    });

    socket.current.on('receiveBuzz', () => {
      setIsShaking(true);
      setShowBuzzNotification(true);
      playNudgeSound();
      setTimeout(() => setIsShaking(false), 820);
      setTimeout(() => setShowBuzzNotification(false), 3000);
    });
    
    socket.current.on('partnerDisconnected', () => {
      handleNext();
    });
    
    socket.current.on('startNewSearch', () => {
      cleanupPeerConnection();
      findPartner("Partnerin sohbetten ayrıldı. Yeni birini arıyorum...");
    });

    return () => {
      if (socket.current) {
        socket.current.disconnect();
      }
      handleDisconnectFlow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = (e) => {
    e.preventDefault();
    if (messageInput.trim() && partner && socket.current) {
        console.log(`[CLIENT DEBUG] Emitting 'sendMessage'. Partner: ${partner}, Socket ID: ${socket.current.id}`);
        const messageData = { 
            message: messageInput, 
            senderId: socket.current.id,
            timestamp: new Date().toISOString() 
        };
        setMessages(prev => [...prev, messageData]);
        socket.current.emit('sendMessage', { message: messageInput });
        setMessageInput('');
        setShowEmojiPicker(false);
    } else {
      console.log(`[CLIENT DEBUG] sendMessage engellendi. Koşullar: Input dolu mu? ${!!messageInput.trim()}, Partner var mı? ${!!partner}, Socket bağlı mı? ${!!socket.current}`);
    }
  };

  const onEmojiClick = (emojiObject) => {
    setMessageInput(prev => prev + emojiObject.emoji);
  };
  
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(prev => !prev);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(prev => !prev);
    }
  };

  const sendBuzz = () => {
    if (partner && socket.current && !buzzCooldown) {
      socket.current.emit('sendBuzz');
      
      setIsShaking(true);
      playNudgeSound();
      setTimeout(() => setIsShaking(false), 820);

      setBuzzCooldown(true);
      setTimeout(() => setBuzzCooldown(false), 5000);
    }
  };
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const countryCodeToFlag = (code) => {
    if (!code) return '🏳️';
    const OFFSET = 127397;
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => c.charCodeAt(0) - 65 + OFFSET));
  };
  
  const getPartnerLabel = (info) => {
    if (!info) return 'Partner';
    return 'Yabancı';
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setRemoteVolume(newVolume);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = newVolume;
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Görüntülü Sohbet</h1>
        <div className="connection-status">
          <span className={`status-dot ${isConnected ? 'connected' : ''}`}></span>
          {isConnected ? `Bağlı (${userCount} kişi)` : 'Bağlantı yok'}
        </div>
      </header>

      {showBuzzNotification && <div className="buzz-notification">Titreşim aldınız!</div>}
      
      <main className="App-main">
        {(!isSearching && !partner) ? (
          <WelcomeScreen onFindPartner={handleFindPartnerClick} />
        ) : (
          <div className={`session-view ${isShaking ? 'shake' : ''}`}>
            <div className="video-area">
              <div className="video-container remote">
                {partner ? (
                  <video ref={remoteVideoRef} autoPlay playsInline></video>
                ) : (
                  <div className="video-placeholder"></div>
                )}
                <div className="video-label-group">
                    {partner && (
                        <div className="video-label partner">
                            {getPartnerLabel(partnerInfo)}
                        </div>
                    )}
                    {partner && isRemoteVideoMuted && <div className="remote-muted-icon"><i className="fa fa-microphone-slash"></i></div>}
                </div>
                {partner && (
                    <div className="volume-control-container">
                        <i className="fa fa-volume-down"></i>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={remoteVolume}
                            onChange={handleVolumeChange}
                            className="volume-slider"
                        />
                        <i className="fa fa-volume-up"></i>
                    </div>
                )}
              </div>
              <div className="video-container local">
                <video ref={localVideoRef} autoPlay muted playsInline></video>
                <div className="video-label you">Siz</div>
                <div className={`secondary-controls ${isMuted || isVideoOff ? 'has-active-controls' : ''}`}>
                    <button onClick={toggleMute} className={`control-btn ${isMuted ? 'active' : ''}`}>
                      <i className={`fa ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                    </button>
                    <button onClick={toggleVideo} className={`control-btn ${isVideoOff ? 'active' : ''}`}>
                      <i className={`fa ${isVideoOff ? 'fa-video-camera-slash' : 'fa-video-camera'}`}></i>
                    </button>
                </div>
              </div>
              <div className="controls-panel">
                <button onClick={handleDisconnect} className="control-btn disconnect">Sonlandır</button>
                <button onClick={handleNext} className="control-btn next" disabled={!partner}>Sıradaki</button>
              </div>
            </div>

            <div className="interaction-panel">
              <div className="chat-panel">
                <div className="messages-list" ref={messagesListRef}>
                  {isSearching && !partner ? (
                    <div className="searching-in-chat">
                      <div className="loader"></div>
                      <h2>Eşleştirme Aranıyor...</h2>
                      <p className="searching-subtitle">Partner bekleniyor...</p>
                    </div>
                  ) : (
                    messages.map((msg, index) => {
                      if (msg.from === 'system') {
                        return (
                          <div key={msg.timestamp || index} className="message-item system">
                            <div className="message-content">
                              <span>{msg.message}</span>
                            </div>
                          </div>
                        );
                      }
                      
                      const messageClass = msg.senderId === socket.current?.id ? 'me' : 'partner';
                      
                      return (
                        <div key={msg.timestamp || index} className={`message-item ${messageClass}`}>
                          <div className="message-content">
                            <Twemoji text={msg.message} />
                            <div className="message-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {showEmojiPicker && (
                  <div ref={emojiPickerRef} className="emoji-picker-container">
                    <EmojiPicker onEmojiClick={onEmojiClick} autoFocusSearch={false} />
                  </div>
                )}

                <form onSubmit={sendMessage} className="message-form">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={partner ? "Mesajınızı yazın..." : ""}
                    autoComplete="off"
                    disabled={!partner}
                  />
                  <button type="button" onClick={sendBuzz} disabled={buzzCooldown || !partner} className={`buzz ${buzzCooldown ? 'cooldown' : ''}`}>
                    <i className="fa fa-bolt"></i>
                  </button>
                  <button type="submit" disabled={!messageInput.trim() || !partner}>
                    <i className="fa fa-paper-plane"></i>
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;