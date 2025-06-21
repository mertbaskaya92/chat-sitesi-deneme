  socket.current.on('receiveBuzz', () => {
    setIsShaking(true);
    playNudgeSound();
  }); 