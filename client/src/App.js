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
  const createMarkup = () => ({
    __html: twemoji.parse(text, {
      folder: '72x72',
      ext: '.png',
      className: 'emoji-img',
      base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/'
    })
  });
  return <div className="message-text-inner" dangerouslySetInnerHTML={createMarkup()} />;
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

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const searchActiveRef = useRef(false);
  const partnerRef = useRef(null);
  const nudgeSound = useRef(null);
  const emojiPickerRef = useRef();

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
      setMessages([{ text: initialMessage, from: 'system', timestamp: new Date().toISOString() }]);
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
    socket.current = io('https://chat-sitesi-deneme-backend.onrender.com');
    nudgeSound.current = new Audio(nudgeSoundFile);

    const pcConfig = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    };

    const createPeerConnection = () => {
      const pc = new RTCPeerConnection(pcConfig);
      pc.onicecandidate = (event) => {
        if (event.candidate && socket.current) {
          socket.current.emit('iceCandidate', { candidate: event.candidate });
        }
      };
      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setRemoteVideoMuted(event.streams[0].getAudioTracks()[0]?.enabled === false);
        }
      };
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
      }
      return pc;
    };

    socket.current.on('connect', () => setIsConnected(true));
    socket.current.on('disconnect', () => {
      setIsConnected(false);
      handleDisconnectFlow();
    });
    socket.current.on('updateUserCount', setUserCount);

    socket.current.on('partnerFound', async (data) => {
      searchActiveRef.current = false;
      setIsSearching(false);
      setPartner(data.partnerId);
      setPartnerInfo(data.partnerInfo);
      setMessages([{ text: `Partnerin bulundu! (${data.partnerInfo.countryName})`, from: 'system', timestamp: new Date().toISOString() }]);
      
      peerConnectionRef.current = createPeerConnection();

      if (data.initiator) {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket.current.emit('offer', { offer });
      }
    });

    socket.current.on('offer', async (data) => {
      if (!peerConnectionRef.current) {
        peerConnectionRef.current = createPeerConnection();
      }
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      socket.current.emit('answer', { answer });
    });

    socket.current.on('answer', async (data) => {
      if (peerConnectionRef.current?.signalingState !== 'stable') {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    socket.current.on('iceCandidate', (data) => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    socket.current.on('newMessage', (data) => {
      setMessages(prev => [...prev, data]);
    });

    socket.current.on('receiveBuzz', () => {
      setIsShaking(true);
      setShowBuzzNotification(true);
      playNudgeSound();
      setTimeout(() => setIsShaking(false), 500);
      setTimeout(() => setShowBuzzNotification(false), 3000);
    });
    
    socket.current.on('noPartnerFoundInTime', () => {
      alert("Yeterli süre içinde eşleşme bulunamadı. Lütfen daha sonra tekrar deneyin.");
      handleCancelSearch();
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
      const messageData = { message: messageInput, from: 'me', timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, messageData]);
      socket.current.emit('sendMessage', { message: messageInput });
      setMessageInput('');
      setShowEmojiPicker(false);
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
  
  return (
    <div className={`App ${isShaking ? 'shake' : ''}`}>
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
          <div className="session-view">
            <div className="video-area">
              <div className="video-container remote">
                {partner ? (
                  <video ref={remoteVideoRef} autoPlay playsInline></video>
                ) : (
                  <div className="video-placeholder"></div>
                )}
                {partner && (
                  <div className="video-label partner">
                    {partnerInfo ? `${countryCodeToFlag(partnerInfo.countryCode)} ${partnerInfo.countryName}` : 'Partner'}
                  </div>
                )}
                {partner && isRemoteVideoMuted && <div className="remote-muted-icon"><i className="fa fa-microphone-slash"></i></div>}
              </div>
              <div className="video-container local">
                <video ref={localVideoRef} autoPlay muted playsInline></video>
                <div className="video-label you">Siz</div>
              </div>
              <div className="controls-panel">
                <button onClick={handleDisconnect} className="control-btn disconnect">Sonlandır</button>
                <button onClick={handleNext} className="control-btn next" disabled={!partner}>Sıradaki</button>
              </div>
            </div>

            <div className="interaction-panel">
              <div className="chat-panel">
                <div className="messages-list">
                  {isSearching && !partner ? (
                    <div className="searching-in-chat">
                      <div className="loader"></div>
                      <h2>Eşleştirme Aranıyor...</h2>
                    </div>
                  ) : (
                    messages.map((msg, index) => (
                      <div key={index} className={`message-item ${msg.from}`}>
                        <div className="message-content">
                          <Twemoji text={msg.message} />
                          <div className="message-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    ))
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
                    placeholder={partner ? "Mesajınızı yazın..." : "Partner bekleniyor..."}
                    autoComplete="off"
                    disabled={!partner}
                  />
                  <button type="button" onClick={sendBuzz} disabled={buzzCooldown || !partner} className="control-btn buzz">⚡</button>
                  <button type="submit" disabled={!messageInput.trim() || !partner}>Gönder</button>
                </form>
              </div>
              <div className="secondary-controls">
                <button onClick={toggleMute} className={`control-btn ${isMuted ? 'active' : ''}`}>{isMuted ? 'Sesi Aç' : 'Sessize Al'}</button>
                <button onClick={toggleVideo} className={`control-btn ${isVideoOff ? 'active' : ''}`}>{isVideoOff ? 'Kamerayı Aç' : 'Kamerayı Kapat'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;