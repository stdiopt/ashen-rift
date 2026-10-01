// Movement, primary fire and targeted spell gestures retain separate pointers.
export function attachTouchControls({ canvas, joystick, buttons, setMove, setAim, setMode, cast, setPrimary, setSkillAim = () => {} }) {
  let joystickPointer = null,lastTouchTime=0;
  const primaryPointers = new Set(), canvasPointers = new Set(), gestures = new Map();
  const primaryGesture = () => [...gestures.values()].find(g => g.skill === 0);
  const updatePrimary = () => setPrimary(primaryPointers.size > 0, primaryGesture() || null);
  const updatePreview = () => setSkillAim([...gestures.values()].at(-1) || null);
  function updateGesture(event) {
    const gesture = gestures.get(event.pointerId);
    if (!gesture) return;
    gesture.dx = event.clientX - gesture.startX;
    gesture.dy = event.clientY - gesture.startY;
    const distance=Math.hypot(gesture.dx,gesture.dy);if(distance>12)gesture.dragged=true;gesture.cancelled=!!gesture.dragged&&distance<8;
    gesture.strength = Math.min(1, Math.hypot(gesture.dx, gesture.dy) / 65);
    const length=Math.max(1,Math.hypot(gesture.dx,gesture.dy)),radius=Math.min(22,length);
    gesture.button?.style?.setProperty("--aim-x",`${gesture.dx/length*radius}px`);
    gesture.button?.style?.setProperty("--aim-y",`${gesture.dy/length*radius}px`);
    updatePrimary(); updatePreview();
  }
  function release(event, shouldCast = false) {
    const gesture = gestures.get(event.pointerId);
    if (gesture && shouldCast && gesture.skill > 0) {
      if (Number.isFinite(event.clientX)) updateGesture(event);
      if(!gesture.cancelled)cast(gesture.skill, gesture);
    }
    gesture?.button?.classList?.remove('aiming');
    gestures.delete(event.pointerId);
    primaryPointers.delete(event.pointerId);
    if (canvasPointers.delete(event.pointerId) && canvasPointers.size === 0) setAim(null, null);
    updatePrimary(); updatePreview();
    if (event.pointerId === joystickPointer) { joystickPointer = null; setMove(0, 0); }
  }
  function moveJoystick(event) {
    if (event.pointerId !== joystickPointer) return;
    const box = joystick.getBoundingClientRect();
    let x = (event.clientX - box.left - box.width / 2) / (box.width * .36);
    let y = (event.clientY - box.top - box.height / 2) / (box.height * .36);
    const length = Math.max(1, Math.hypot(x, y));
    setMove(x / length, y / length);
  }
  joystick.addEventListener('pointerdown', event => {
    if(event.pointerType==='touch')return;
    event.preventDefault();
    if (joystickPointer !== null) return;
    joystickPointer = event.pointerId; setMode('touch');
    joystick.setPointerCapture(event.pointerId); moveJoystick(event);
  });
  joystick.addEventListener('pointermove', moveJoystick);
  for (const button of buttons) {
    if(button.style)button.style.touchAction="none";
    button.addEventListener('pointerdown', event => {
      if(event.pointerType==='touch')return;
      event.preventDefault(); event.stopPropagation();
      const skill = Number(button.dataset.skill);
      button.setPointerCapture(event.pointerId);
      if (event.pointerType === 'touch' && skill < 4) {
        setMode('touch');
        button.classList?.add("aiming");button.style?.setProperty("--aim-x","0px");button.style?.setProperty("--aim-y","0px");
        const gesture = { button, skill, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, strength: 0 };
        gestures.set(event.pointerId, gesture);
        if (skill === 0) { primaryPointers.add(event.pointerId); cast(0, gesture); }
        updatePrimary(); updatePreview();
      } else {
        if (event.pointerType === 'touch') setMode('touch');
        if (skill === 0) primaryPointers.add(event.pointerId);
        cast(skill); updatePrimary();
      }
    });

    button.addEventListener('click', event => { if (event.detail === 0&&Date.now()-lastTouchTime>700) cast(Number(button.dataset.skill)); });
    // Capture loss can occur while the finger is still down; global listeners
    // keep this pointer's original skill until up or cancel.
    button.addEventListener('lostpointercapture', event => {
      if(gestures.has(event.pointerId))try{button.setPointerCapture(event.pointerId);}catch{}
    });
  }
  window.addEventListener('pointermove', event => {
    updateGesture(event);moveJoystick(event);
    if(canvasPointers.has(event.pointerId))setAim(event.clientX,event.clientY);
  }, {capture:true});
  window.addEventListener('pointerup', event => release(event, true), {capture:true});
  window.addEventListener('pointercancel', event => release(event), {capture:true});
  // Native touch identifiers keep ownership independent of DOM pointer capture.
  const touchEvent=touch=>({pointerId:'touch-'+touch.identifier,clientX:touch.clientX,clientY:touch.clientY});
  const touchStart=(element,kind)=>element.addEventListener('touchstart',event=>{
    event.preventDefault();event.stopPropagation();lastTouchTime=Date.now();setMode('touch');
    for(const touch of event.changedTouches){const point=touchEvent(touch);
      if(kind==='move'){if(joystickPointer!==null)continue;joystickPointer=point.pointerId;moveJoystick(point);}
      else if(kind==='canvas'){canvasPointers.add(point.pointerId);primaryPointers.add(point.pointerId);setAim(point.clientX,point.clientY);cast(0);}
      else {const skill=Number(element.dataset.skill);if(skill===4){cast(4);continue;}
        const gesture={button:element,skill,startX:point.clientX,startY:point.clientY,dx:0,dy:0,strength:0};
        gestures.set(point.pointerId,gesture);element.classList?.add('aiming');
        element.style?.setProperty('--aim-x','0px');element.style?.setProperty('--aim-y','0px');
        if(skill===0){primaryPointers.add(point.pointerId);cast(0,gesture);}
      }
    }updatePrimary();updatePreview();
  },{passive:false});
  touchStart(joystick,'move');touchStart(canvas,'canvas');for(const button of buttons)touchStart(button,'skill');
  window.addEventListener('touchmove',event=>{
    let handled=false;for(const touch of event.changedTouches){const point=touchEvent(touch);
      if(gestures.has(point.pointerId)||canvasPointers.has(point.pointerId)||joystickPointer===point.pointerId){handled=true;updateGesture(point);moveJoystick(point);if(canvasPointers.has(point.pointerId))setAim(point.clientX,point.clientY);}
    }if(handled)event.preventDefault();
  },{capture:true,passive:false});
  for(const name of ['touchend','touchcancel'])window.addEventListener(name,event=>{
    lastTouchTime=Date.now();for(const touch of event.changedTouches)release(touchEvent(touch),name==='touchend');
  },{capture:true,passive:false});
  function reset() {
    for(const gesture of gestures.values())gesture.button?.classList?.remove('aiming');
    joystickPointer = null; primaryPointers.clear(); canvasPointers.clear(); gestures.clear();
    setAim(null, null); setMove(0, 0); updatePrimary(); updatePreview();
  }
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  return reset;
}
