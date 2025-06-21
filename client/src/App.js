import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';
import data from '@emoji-mart/data';
import nudgeSoundFile from './sounds/nudge.mp3';
import twemoji from 'twemoji';
import './App.css';
import 'font-awesome/css/font-awesome.min.css';

// WelcomeScreen ve diğer bileşenleri import edelim
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

// YENİ: Emoji'leri resim olarak render eden yardımcı bileşen
const EmojiMessage = ({ text }) => {
  const createMarkup = () => ({
    __html: twemoji.parse(text, {
      folder: '72x72',
      ext: '.png',
      className: 'emoji-img',
      base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/' // Alternatif, daha güvenilir sunucu
    })
  });
  return <div className="message-text-inner" dangerouslySetInnerHTML={createMarkup()} />;
};

const createEmojiMarkup = (text) => ({
  __html: twemoji.parse(text, {
    folder: '72x72',
    ext: '.png',
    className: 'emoji-img',
    base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/'
  })
});

const Twemoji = ({ text }) => {
  const markup = {
    __html: twemoji.parse(text || '', {
      folder: 'svg',
      ext: '.svg',
      className: 'emoji-img',
      base: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/assets/'
    })
  };
  return <span dangerouslySetInnerHTML={markup} />;
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
  const [emojiSuggestions, setEmojiSuggestions] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isRemoteVideoMuted, setRemoteVideoMuted] = useState(false);
  const [isVideoBlurred, setIsVideoBlurred] = useState(true);
  const [isShaking, setIsShaking] = useState(false);
  const [buzzCooldown, setBuzzCooldown] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [showEmojiSuggestions, setShowEmojiSuggestions] = useState(false);
  const [nudgeDuration, setNudgeDuration] = useState(500);
  const [isPartnerVideoBlurred, setIsPartnerVideoBlurred] = useState(false);
  const [showBuzzNotification, setShowBuzzNotification] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const searchActiveRef = useRef(false);
  const partnerRef = useRef(null);

  const [nudgeSound, setNudgeSound] = useState(null);

  const emojiPickerRef = useRef();
  const messageInputRef = useRef();
  const nudgeSoundRef = useRef();

  const playNudgeSound = useCallback(() => {
    if (nudgeSound) {
      nudgeSound.currentTime = 0;
      nudgeSound.play().catch(e => console.error("Ses çalma hatası:", e));
    }
  }, [nudgeSound]);

  const stopMediaTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
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
    setEmojiSuggestions([]);
    setShowEmojiPicker(false);
    setMessageInput('');
    searchActiveRef.current = false;
  }, []);

  const cleanupPeerConnection = useCallback(() => {
    console.log('Peer connection temizleniyor...');
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
      remoteVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  const findPartner = useCallback(async (initialMessage = null) => {
    console.log('Finding partner...');
    searchActiveRef.current = true;
    setIsSearching(true);

    if (initialMessage) {
      setMessages([{
        text: initialMessage,
        from: 'system',
        timestamp: new Date().toISOString()
      }]);
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
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        } else {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
      } catch (err) {
        console.error("Kamera/mikrofon erişim hatası:", err);
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
    console.log('Cancelling search...');
    searchActiveRef.current = false;
    if (socket.current) {
      socket.current.emit('cancelSearch');
    }
    stopMediaTracks();
    resetState();
  }, [socket, stopMediaTracks, resetState]);
  
  const handleNext = useCallback(() => {
    if (partner && socket.current) {
      socket.current.emit('disconnectPartner');
      cleanupPeerConnection();
      findPartner();
    }
  }, [partner, cleanupPeerConnection, findPartner]);

  const handleDisconnect = useCallback(() => {
    if (partner && socket.current) {
      socket.current.emit('leaveChat');
    }
    cleanupPeerConnection();
    stopMediaTracks();
    resetState();
  }, [partner, cleanupPeerConnection, stopMediaTracks, resetState]);

  useEffect(() => {
    partnerRef.current = partner;
  }, [partner]);

  useEffect(() => {
    const audio = new Audio(nudgeSoundFile);
    audio.onloadedmetadata = () => {
      setNudgeDuration(audio.duration * 1000); 
    };
    setNudgeSound(audio);
  }, []);

  const countryCodeToFlag = (code) => {
    if (!code) return '🏳️';
    const OFFSET = 127397;
    const a = 'A'.charCodeAt(0);
    const z = 'Z'.charCodeAt(0);
    const chars = [...code.toUpperCase()]
      .map(char => {
        const charCode = char.charCodeAt(0);
        if (charCode >= a && charCode <= z) {
          return String.fromCodePoint(charCode - a + OFFSET);
        }
        return char;
      });
    return chars.join('');
  };
  
  useEffect(() => {
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';
    socket.current = io(serverUrl);

    const pcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    const createPeerConnection = () => {
      const pc = new RTCPeerConnection(pcConfig);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.current.emit('iceCandidate', { candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      peerConnectionRef.current = pc;
      return pc;
    };

    socket.current.on('connect', () => setIsConnected(true));
    socket.current.on('disconnect', () => setIsConnected(false));
    
    socket.current.on('partnerFound', async (data) => {
      console.log('Partner found:', data);
      setPartner(data.partnerId);
      setPartnerInfo(data.partnerInfo);
      setIsSearching(false);
      
      const pc = createPeerConnection();

      if (data.initiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.current.emit('offer', { offer });
      }

      setIsVideoBlurred(true); 
      setTimeout(() => setIsVideoBlurred(false), 3000);
    });

    socket.current.on('offer', async (data) => {
        if (data.from !== partnerRef.current) return;
        
        if (peerConnectionRef.current && peerConnectionRef.current.signalingState === 'stable') {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          socket.current.emit('answer', { answer });
        } else {
           console.warn(`Offer alındı ancak sinyal durumu 'stable' değil (\${peerConnectionRef.current?.signalingState}), işlem yoksayılıyor.`);
        }
    });

    socket.current.on('answer', async (data) => {
        if (data.from !== partnerRef.current) return;
        
        if (peerConnectionRef.current && peerConnectionRef.current.signalingState === 'have-local-offer') {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else {
          console.warn(`Cevap alındı ancak sinyal durumu 'have-local-offer' değil (\${peerConnectionRef.current?.signalingState}), işlem yoksayılıyor.`);
        }
    });

    socket.current.on('iceCandidate', async (data) => {
        if (data.from !== partnerRef.current) return;
        try {
            if (peerConnectionRef.current) {
              await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (e) {
            console.error('Error adding received ice candidate', e);
        }
    });

    socket.current.on('newMessage', (data) => {
      setMessages(prev => [...prev, { text: data.message, from: 'partner', timestamp: data.timestamp }]);
    });

    socket.current.on('partnerDisconnected', () => {
      setMessages(prev => [...prev, {
        text: 'Partnerin bağlantısı kesildi. Yeni birini arıyoruz...',
        from: 'system',
        timestamp: new Date().toISOString()
      }]);
      cleanupPeerConnection();
      findPartner('Partnerin bağlantısı kesildi. Yeni birini arıyoruz...');
    });
    
    socket.current.on('startNewSearch', () => {
        cleanupPeerConnection();
        findPartner('Partneriniz sohbetten ayrıldı. Yeni birini arıyoruz...');
    });

    // Eşleşme zaman aşımı
    socket.current.on('noPartnerFoundInTime', () => {
      alert("Kimse bulunamadı. Lütfen daha sonra tekrar deneyin.");
      handleCancelSearch(); // Arama iptal etme ve ana menüye dönme
    });

    socket.current.on('updateUserCount', (count) => {
      setUserCount(count);
    });

    socket.current.on('receiveBuzz', () => {
      // Partner'den gelen titreşim sinyali
      playNudgeSound();
      setIsShaking(true);
      setShowBuzzNotification(true);
      
      setTimeout(() => {
        setIsShaking(false);
      }, nudgeDuration);
      
      setTimeout(() => {
        setShowBuzzNotification(false);
      }, 3000); // 3 saniye sonra bildirimi gizle
    });

    return () => socket.current.close();
  }, [cleanupPeerConnection, findPartner, handleCancelSearch]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (messageInput.trim() && socket.current) {
      socket.current.emit('sendMessage', { message: messageInput });
      setMessages(prev => [...prev, {
        text: messageInput,
        from: 'me',
        timestamp: new Date().toISOString()
      }]);
      setMessageInput('');
    }
  };

  const onEmojiClick = (emojiObject) => {
    setMessageInput(prev => prev + emojiObject.emoji);
    setShowEmojiPicker(false);
  };

  const toggleEmojiPicker = () => {
    setShowEmojiPicker(!showEmojiPicker);
  };

  // Emoji shortcode handling
  const handleMessageChange = (e) => {
    const value = e.target.value;
    setMessageInput(value);
    
    // Check for emoji shortcodes
    const shortcodeMatch = value.match(/:([a-zA-Z0-9_]+)$/);
    if (shortcodeMatch) {
      const searchTerm = shortcodeMatch[1].toLowerCase();
      const suggestions = Object.values(data.emojis)
        .filter(emoji => 
          emoji.id.toLowerCase().includes(searchTerm) ||
          (emoji.keywords && emoji.keywords.some(keyword => keyword.toLowerCase().includes(searchTerm)))
        )
        .slice(0, 8)
        .map(emoji => ({
          id: emoji.id,
          emoji: emoji.skins[0].native,
          shortcode: `:${emoji.id}:`
        }));
      
      setEmojiSuggestions(suggestions);
      setShowEmojiSuggestions(suggestions.length > 0);
    } else {
      setShowEmojiSuggestions(false);
    }
  };

  const selectEmojiSuggestion = (suggestion) => {
    const newValue = messageInput.replace(/:([a-zA-Z0-9_]+)$/, suggestion.emoji + ' ');
    setMessageInput(newValue);
    setShowEmojiSuggestions(false);
    messageInputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (showEmojiSuggestions && e.key === 'Tab') {
      e.preventDefault();
      if (emojiSuggestions.length > 0) {
        selectEmojiSuggestion(emojiSuggestions[0]);
      }
    }
  };

  // Click outside emoji picker to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const sendBuzz = () => {
    if (socket.current && !buzzCooldown) {
      socket.current.emit('sendBuzz');
      playNudgeSound();
      
      // Send buzz to partner and shake own screen
      setIsShaking(true);
      setBuzzCooldown(true);

      setTimeout(() => {
        setIsShaking(false);
      }, nudgeDuration); // Dinamik süre kullan

      setTimeout(() => {
        setBuzzCooldown(false);
      }, 5000); // 5 saniye bekleme süresi
    }
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

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎥 Video Chat App</h1>
        <div className="connection-status">
          {isConnected ? (
            <>
              <span className="status-indicator connected"></span>
              {userCount} Ziyaretçi
            </>
          ) : (
            <>
              <span className="status-indicator disconnected"></span>
              Bağlantı Yok
            </>
          )}
        </div>
      </header>

      <main className="App-main">
        {(!isSearching && !partner) ? (
          <WelcomeScreen onFindPartner={handleFindPartnerClick} />
        ) : (
          <div 
            className="chat-container"
            style={isShaking ? { animation: `shake ${nudgeDuration}ms cubic-bezier(.36,.07,.19,.97) both` } : {}}
          >
            <div className="video-container">
              <div className="video-grid">
                <div className={`video-wrapper ${isVideoBlurred ? 'video-blurred' : ''}`}>
                  <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline muted={isRemoteVideoMuted}></video>
                  <div className="video-label partner-label">Partner</div>
                </div>
                <div className="video-wrapper">
                  <video ref={localVideoRef} className="local-video" autoPlay playsInline muted></video>
                  <div className="video-label">Siz</div>
                  <div className="local-video-controls">
                    <button onClick={toggleMute} className={`control-btn ${isMuted ? 'off' : ''}`}>
                      <i className={`fa ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                    </button>
                    <button onClick={toggleVideo} className={`control-btn ${isVideoOff ? 'off' : ''}`}>
                       <i className={`fa ${isVideoOff ? 'fa-video-camera' : 'fa-video-camera'}`}>{isVideoOff && <span className="slash"></span>}</i>
                    </button>
                  </div>
                </div>
              </div>
               <div className="video-controls">
                <button className="next-btn" onClick={handleNext} disabled={!partner || isSearching}>
                  <i className="fa fa-forward"></i> Sıradaki
                </button>
                <button className="disconnect-btn" onClick={handleDisconnect}>
                  Sonlandır
                </button>
              </div>
            </div>
            <div className="chat-panel">
               {(!partner && isSearching) ? (
                <div className="waiting-screen-inline">
                  <div className="loading-spinner"></div>
                  <h2>Eşleştirme Aranıyor...</h2>
                  <p>Lütfen bekleyin, sizin için birini buluyoruz.</p>
                  <button className="cancel-btn" onClick={handleCancelSearch}>İptal</button>
                </div>
              ) : (
                <>
                  {partnerInfo && (
                    <div className="chat-header">
                      <Twemoji text={countryCodeToFlag(partnerInfo.countryCode)} />
                      <span>{partnerInfo.countryName} ülkesinden biriyle sohbet ediyorsun.</span>
                    </div>
                  )}
                  
                  {/* Titreşim Bildirimi - Chat Panel İçinde */}
                  {showBuzzNotification && (
                    <div className="buzz-notification">
                      <span className="buzz-icon">⚡</span>
                      <span>Partneriniz size bir titreşim gönderdi!</span>
                    </div>
                  )}
                  
                  <div className="messages-container">
                    {messages.map((msg, index) => {
                      if (msg.from === 'system') {
                        return (
                          <div key={index} className="message system-message">
                            <Twemoji text={msg.text} />
                          </div>
                        );
                      }
                      return (
                        <div 
                          key={index} 
                          className={`message ${msg.from === 'me' ? 'my-message' : 'partner-message'}`}
                        >
                          <div className="message-text">
                             <Twemoji text={msg.text} />
                          </div>
                          <div className="message-time">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <form className="message-form" onSubmit={sendMessage}>
                    <div className="message-input-container">
                      <input
                        type="text"
                        value={messageInput}
                        onChange={handleMessageChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Mesajınızı yazın..."
                        className="message-input"
                        ref={messageInputRef}
                      />
                      <button 
                        type="button" 
                        className="emoji-btn"
                        onClick={toggleEmojiPicker}
                      >
                        <span>😊</span>
                      </button>
                      {showEmojiSuggestions && (
                        <div className="emoji-suggestions">
                          {emojiSuggestions.map((suggestion, index) => (
                            <button
                              key={index}
                              className="emoji-suggestion-item"
                              onClick={() => selectEmojiSuggestion(suggestion)}
                            >
                              <span className="emoji-suggestion-emoji">{suggestion.emoji}</span>
                              <span className="emoji-suggestion-text">:{suggestion.id}:</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {showEmojiPicker && (
                        <div className="emoji-picker-container" ref={emojiPickerRef}>
                          <EmojiPicker
                            onEmojiClick={onEmojiClick}
                            width={300}
                            height={400}
                            searchPlaceholder="Emoji ara..."
                          />
                        </div>
                      )}
                    </div>
                    <button 
                      type="button" 
                      className={`buzz-btn ${buzzCooldown ? 'cooldown' : ''}`}
                      onClick={sendBuzz}
                      disabled={buzzCooldown}
                      title={buzzCooldown ? '' : 'Titreşim gönder'}
                    >
                      <span>⚡</span>
                    </button>
                    <button type="submit" className="send-btn">
                      <span>📤 Gönder</span>
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App; 