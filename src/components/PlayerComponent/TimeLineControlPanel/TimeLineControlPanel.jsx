import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import { useDispatch } from 'react-redux';
import { ButtonWithIcon } from 'components/reusableComponents/ButtonWithIcon';
import ReusablePopup from '../ReusablePopup';
import RemoveSilenceMenu from '../RemoveSilenceMenu/RemoveSilenceMenu';
import PopupPortal from '../PopupPortal/PopupPortal';
import { removeSilence } from '../../../services/audioApi';
import { StoreContext } from '../../../mobx';
import { runInAction } from 'mobx';
import useUploadProgress from '../../../hooks/useUploadProgress';
import { validateFile } from '../../../utils/fileValidation';
import { getAcceptAttribute, formatFileSize } from '../../../utils/fileFormatters';
import toast from 'react-hot-toast';
import styles from './TimeLineControlPanel.module.scss';

const TimeLineControlPanel = ({

  checkedStates,
  onToggleCheckbox,
  onReset,


  currentVolume,
  isMuted,
  onVolumeChange,
  onMuteToggle,
  isSelectedElementsAudio = false,
  selectedAudioElements = [],


  currentSpeed,
  onSpeedChange,
  speedOptions = [
    { label: '2x', value: 2 },
    { label: '1.5x', value: 1.5 },
    { label: '1x', value: 1 },
    { label: '0.5x', value: 0.5 },
  ],


  onUndo,
  onRedo,
  isUndoRedoLoading = false,


  isCutMode = false,
  onCutToggle,


  onCompactAudio,


  currentScale,
  onScaleChange,
  scaleRangeRef,


  showMoreOptions = true,
  moreMenuOptions = [
    { id: 1, name: 'Edit subtitles', icon: 'EditSubtitlesIcon' },
    { id: 2, name: 'Regenerate audio', icon: 'RegenerateIcon' },
    { id: 3, name: 'Regenerate subtitles', icon: 'RegenerateIcon' },
    { id: 4, name: 'Visual effects', icon: 'ThreeCirclesIcon' },
  ],
  onMoreMenuClick,


  settingsMenuOptions = [
    { id: 1, name: 'Volume Control' },
    { id: 2, name: 'Reset' },
    { id: 3, name: 'Playback Speed' },
    { id: 4, name: 'Undo/ Redo' },
    { id: 5, name: 'Transitions' },
    { id: 6, name: 'Cut' },
    { id: 7, name: 'Remove silence' },
    { id: 8, name: 'Compact audio' },
    { id: 9, name: 'Zoom' },
  ],
  controlsPosition = 0,
  onPositionChange,
  timelineControlsRef,
  onDraggingChange,
  dragVariant = 'timeline',
}) => {
  const [isVolumeControlHovered, setIsVolumeControlHovered] = useState(false);
  const [isVolumeControlClicked, setIsVolumeControlClicked] = useState(false);
  const [isZoomControlHovered, setIsZoomControlHovered] = useState(false);
  const [isZoomControlClicked, setIsZoomControlClicked] = useState(false);
  const [isSettingsMenuVisible, setIsSettingsMenuVisible] = useState(false);
  const [isMoreMenuVisible, setIsMoreMenuVisible] = useState(false);
  const [isSpeedControlVisible, setIsSpeedControlVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [isCenterAreaHidden, setIsCenterAreaHidden] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isRemoveSilenceVisible, setIsRemoveSilenceVisible] = useState(false);
  const [isProcessingSilence, setIsProcessingSilence] = useState(false);
  const [removeSilenceMenuCoords, setRemoveSilenceMenuCoords] = useState({
    x: 0,
    y: 0,
  });
  const [selectedAudioForSilence, setSelectedAudioForSilence] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({});
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const dispatch = useDispatch();
  const { upload, cancel, isUploading } = useUploadProgress();
  const timelineControlsOptionsRef = useRef(null);
  const volumeContainerRef = useRef(null);
  const volumeNumberRef = useRef(null);
  const moreMenuRef = useRef(null);
  const settingsMenuRef = useRef(null);
  const speedControlRef = useRef(null);
  const settingsMenuTimeoutRef = useRef(null);
  const speedControlTimeoutRef = useRef(null);
  const moreMenuTimeoutRef = useRef(null);
  const removeSilenceRef = useRef(null);
  const removeSilenceTimeoutRef = useRef(null);
  const removeSilenceButtonRef = useRef(null);
  const isMouseOverRemoveSilenceMenuRef = useRef(false);
  const isMouseOverRemoveSilenceButtonRef = useRef(false);
  const selectedAudioIdRef = useRef(null);

  const store = React.useContext(StoreContext);


  useEffect(() => {
    const handleClickOutside = event => {

      if (
        isRemoveSilenceVisible &&
        removeSilenceRef.current &&
        !removeSilenceRef.current.contains(event.target) &&
        removeSilenceButtonRef.current &&
        !removeSilenceButtonRef.current.contains(event.target)
      ) {
        setIsRemoveSilenceVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRemoveSilenceVisible]);


  const getCheckedStateByName = optionName => {
    const optionIndex = settingsMenuOptions.findIndex(
      option => option.name === optionName
    );
    return optionIndex !== -1 ? checkedStates[optionIndex] : false;
  };


  const [{ isOver }, drop] = useDrop({
    accept: 'timeline-controls',
    drop: (item, monitor) => {
      const clientOffset = monitor.getClientOffset();
      if (clientOffset && timelineControlsRef?.current) {
        const containerRect =
          timelineControlsRef.current.getBoundingClientRect();
        const relativeX = clientOffset.x - containerRect.left;


        const containerWidth = containerRect.width;
        const controlsWidth =
          timelineControlsOptionsRef.current?.offsetWidth || 0;
        const playbackWidth =
          timelineControlsRef.current.querySelector(
            `.${styles.playbackControls}`
          )?.offsetWidth || 0;

        let newPosition = relativeX;

        if (dragVariant === 'timeline') {


          const centerStart = (containerWidth - playbackWidth) / 2 - 120;
          const centerEnd = (containerWidth + playbackWidth) / 2 + 60;


          const snapThreshold = 30;
          const distanceFromLeft = newPosition;
          const distanceFromRight =
            containerWidth - (newPosition + controlsWidth);

          if (distanceFromLeft <= snapThreshold) {

            newPosition = 10;
          } else if (distanceFromRight <= snapThreshold) {

            newPosition = containerWidth - controlsWidth - 30;
          } else {

            if (
              newPosition + controlsWidth > centerStart &&
              newPosition < centerEnd
            ) {

              const dropCenter = relativeX;
              const centerAreaCenter = (centerStart + centerEnd) / 2;

              if (dropCenter < centerAreaCenter) {

                newPosition = centerStart - controlsWidth;
              } else {

                newPosition = centerEnd;
              }
            }
          }


          newPosition = Math.max(
            0,
            Math.min(newPosition, containerWidth - controlsWidth - 30)
          );
        } else if (dragVariant === 'freeMove') {

          const leftPadding = -20;
          const availableWidth = containerWidth;


          newPosition = Math.max(
            leftPadding,
            Math.min(newPosition, leftPadding + availableWidth - controlsWidth)
          );
        }

        onPositionChange?.(newPosition);
      }
    },
    collect: monitor => ({
      isOver: monitor.isOver(),
    }),
  });


  const handleDragStart = e => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);


    if (dragVariant === 'timeline') {
      setIsCenterAreaHidden(true);
    }

    setDragStartPos({ x: e.clientX, y: e.clientY });


    if (timelineControlsOptionsRef.current) {
      const controlsRect =
        timelineControlsOptionsRef.current.getBoundingClientRect();
      const offset = e.clientX - controlsRect.left;
      setDragOffset(offset);
    }
  };


  const handleDragEnd = () => {
    setIsDragging(false);


    if (dragVariant === 'timeline') {
      setIsCenterAreaHidden(false);
    }


    if (
      dragVariant === 'timeline' &&
      timelineControlsRef?.current &&
      timelineControlsOptionsRef.current
    ) {
      const containerWidth = timelineControlsRef.current.offsetWidth;
      const controlsWidth = timelineControlsOptionsRef.current.offsetWidth;
      const playbackWidth =
        timelineControlsRef.current.querySelector(`.${styles.playbackControls}`)
          ?.offsetWidth || 0;

      const centerStart = (containerWidth - playbackWidth) / 2 - 120;
      const centerEnd = (containerWidth + playbackWidth) / 2 + 60;


      if (
        controlsPosition + controlsWidth > centerStart &&
        controlsPosition < centerEnd
      ) {

        const controlsCenter = controlsPosition + controlsWidth / 2;
        const centerAreaCenter = (centerStart + centerEnd) / 2;

        let newPosition;
        if (controlsCenter < centerAreaCenter) {

          newPosition = centerStart - controlsWidth;
        } else {

          newPosition = centerEnd;
        }


        newPosition = Math.max(
          0,
          Math.min(newPosition, containerWidth - controlsWidth - 30)
        );
        onPositionChange?.(newPosition);
      }
    }
  };

  useEffect(() => {
    const timelineContent = document.querySelector(
      '[class*="Player_timelineContent"]'
    );
    if (timelineContent && store) {
      const maxTime = Math.max(1, store.maxTime || 1);
      const thumbRatio = Math.max(
        0,
        Math.min(1, store.currentTimeInMs / maxTime)
      );

      requestAnimationFrame(() => {
        const totalWidthAfter = timelineContent.scrollWidth;
        const visibleWidthAfter = timelineContent.clientWidth;
        const thumbPosAfter = thumbRatio * totalWidthAfter;

        let newScrollLeft = thumbPosAfter - visibleWidthAfter / 2;
        const maxScroll = Math.max(0, totalWidthAfter - visibleWidthAfter);
        newScrollLeft = Math.max(0, Math.min(newScrollLeft, maxScroll));

        timelineContent.scrollLeft = newScrollLeft;
      });
    }
  }, [currentScale]);


  const handleMouseMove = useCallback(
    e => {
      if (isDragging && timelineControlsRef?.current) {
        e.preventDefault();
        const containerRect =
          timelineControlsRef.current.getBoundingClientRect();


        const relativeX = e.clientX - containerRect.left;
        const controlsWidth =
          timelineControlsOptionsRef.current?.offsetWidth || 0;
        const containerWidth = containerRect.width;


        let finalPosition = relativeX - dragOffset;

        if (dragVariant === 'timeline') {

          const playbackWidth =
            timelineControlsRef.current.querySelector(
              `.${styles.playbackControls}`
            )?.offsetWidth || 0;


          const centerStart = (containerWidth - playbackWidth) / 2 - 120;
          const centerEnd = (containerWidth + playbackWidth) / 2 + 60;


          const snapThreshold = 30;
          const distanceFromLeft = finalPosition;
          const distanceFromRight =
            containerWidth - (finalPosition + controlsWidth);

          if (distanceFromLeft <= snapThreshold) {
            finalPosition = 10;
          } else if (distanceFromRight <= snapThreshold) {
            finalPosition = containerWidth - controlsWidth - 30;
          } else {

            if (
              finalPosition + controlsWidth > centerStart &&
              finalPosition < centerEnd
            ) {

              const mouseCenter = relativeX;
              const centerAreaCenter = (centerStart + centerEnd) / 2;

              if (mouseCenter < centerAreaCenter) {

                finalPosition = centerStart - controlsWidth;
              } else {

                finalPosition = centerEnd;
              }
            }
          }


          finalPosition = Math.max(
            0,
            Math.min(finalPosition, containerWidth - controlsWidth - 30)
          );
        } else if (dragVariant === 'freeMove') {
          finalPosition = relativeX;

          const leftPadding = -20;
          const availableWidth = containerWidth;


          finalPosition = Math.max(
            leftPadding,
            Math.min(
              finalPosition,
              leftPadding + availableWidth - controlsWidth
            )
          );
        }

        onPositionChange?.(finalPosition);
      }
    },
    [isDragging, onPositionChange, timelineControlsRef, dragOffset, dragVariant]
  );


  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleDragEnd);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleMouseMove]);


  useEffect(() => {
    onDraggingChange?.(isDragging);
  }, [isDragging, onDraggingChange]);


  useEffect(() => {

    if (isDragging) return;


    const timeoutId = setTimeout(() => {
      if (timelineControlsRef?.current && timelineControlsOptionsRef.current) {
        const containerWidth = timelineControlsRef.current.offsetWidth;
        const controlsWidth = timelineControlsOptionsRef.current.offsetWidth;

        if (dragVariant === 'timeline') {

          const playbackWidth =
            timelineControlsRef.current.querySelector(
              `.${styles.playbackControls}`
            )?.offsetWidth || 0;

          const resizeCenterStart = (containerWidth - playbackWidth) / 2 - 120;
          const resizeCenterEnd = (containerWidth + playbackWidth) / 2 + 60;


          if (controlsPosition + controlsWidth > containerWidth - 30) {
            const newPosition = Math.max(
              0,
              containerWidth - controlsWidth - 30
            );
            onPositionChange?.(newPosition);
          }


          if (
            controlsPosition < resizeCenterStart &&
            controlsPosition + controlsWidth > resizeCenterStart
          ) {
            const newPosition = resizeCenterStart - controlsWidth;
            onPositionChange?.(Math.max(0, newPosition));
          }
        } else if (dragVariant === 'freeMove') {

          const leftPadding = -20;
          const availableWidth = containerWidth;

          if (controlsPosition + controlsWidth > leftPadding + availableWidth) {
            const newPosition = Math.max(
              leftPadding,
              leftPadding + availableWidth - controlsWidth
            );
            onPositionChange?.(newPosition);
          }
        }
      }
    }, 50)

    return () => clearTimeout(timeoutId);
  }, [
    checkedStates,
    controlsPosition,
    onPositionChange,
    timelineControlsRef,
    isDragging,
    dragVariant,
  ]);


  useEffect(() => {
    return () => {
      if (removeSilenceTimeoutRef.current) {
        clearTimeout(removeSilenceTimeoutRef.current);
      }
    };
  }, []);


  useEffect(() => {

    if (isDragging) return;

    const handleResize = () => {
      if (timelineControlsRef?.current && timelineControlsOptionsRef.current) {
        const containerWidth = timelineControlsRef.current.offsetWidth;
        const controlsWidth = timelineControlsOptionsRef.current.offsetWidth;

        if (dragVariant === 'timeline') {

          const playbackWidth =
            timelineControlsRef.current.querySelector(
              `.${styles.playbackControls}`
            )?.offsetWidth || 0;

          const handleResizeCenterStart =
            (containerWidth - playbackWidth) / 2 - 120;
          const handleResizeCenterEnd =
            (containerWidth + playbackWidth) / 2 + 60;


          if (controlsPosition + controlsWidth > containerWidth - 30) {
            const newPosition = Math.max(
              0,
              containerWidth - controlsWidth - 30
            );
            onPositionChange?.(newPosition);
          }


          if (
            controlsPosition < handleResizeCenterStart &&
            controlsPosition + controlsWidth > handleResizeCenterStart
          ) {
            const newPosition = handleResizeCenterStart - controlsWidth;
            onPositionChange?.(Math.max(0, newPosition));
          }
        } else if (dragVariant === 'freeMove') {
          const leftPadding = -20;
          const availableWidth = containerWidth;

          if (controlsPosition + controlsWidth > leftPadding + availableWidth) {
            const newPosition = Math.max(
              leftPadding,
              leftPadding + availableWidth - controlsWidth
            );
            onPositionChange?.(newPosition);
          }
        }
      }
    };


    handleResize();


    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [
    controlsPosition,
    onPositionChange,
    timelineControlsRef,
    isDragging,
    dragVariant,
  ]);


  const getPositionStyles = () => {
    return {
      transform: `translateX(${controlsPosition}px)`,
      position: 'relative',
    };
  };


  const isNearRightEdge = () => {
    if (!timelineControlsRef?.current || !timelineControlsOptionsRef.current)
      return false;

    const containerRect = timelineControlsRef.current.getBoundingClientRect();
    const controlsWidth = timelineControlsOptionsRef.current.offsetWidth;


    const distanceFromRight =
      containerRect.width - (controlsPosition + controlsWidth);
    return distanceFromRight <= 90;
  };


  const getDropZoneStyles = () => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
    width: '100%',
    backgroundColor: isDragging
      ? ' rgba(255, 255, 255, 0.06)'
      : isOver
      ? 'rgba(255, 255, 255, 0.06)'
      : 'transparent',
    transition: 'all 0.2s ease',
    pointerEvents: 'auto',
    zIndex: 1,
  });


  const getCenterAreaStyles = () => {

    if (dragVariant !== 'timeline' || !timelineControlsRef?.current) return {};

    const containerWidth = timelineControlsRef.current.offsetWidth;
    const playbackWidth =
      timelineControlsRef.current.querySelector(`.${styles.playbackControls}`)
        ?.offsetWidth || 0;

    const indicatorCenterStart = (containerWidth - playbackWidth) / 2 - 120;
    const indicatorCenterEnd = (containerWidth + playbackWidth) / 2 + 60;

    return {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: `${indicatorCenterStart}px`,
      width: `${indicatorCenterEnd - indicatorCenterStart}px`,
      backgroundColor: 'rgba(255, 255, 255, 0.02)',
      border: '1px dashed rgba(255, 255, 255, 0.1)',
      pointerEvents: 'none',
      zIndex: 0,
      opacity: isCenterAreaHidden ? 0 : isOver || isDragging ? 0.3 : 0,
      transition: 'opacity 0.2s ease',
    };
  };

  const handleMoreMenuClick = option => {
    setIsMoreMenuVisible(false);
    onMoreMenuClick?.(option);
  };

  const handleSpeedChange = option => {
    setIsSpeedControlVisible(false);
    onSpeedChange?.(option);
  };

  const getCurrentSpeedLabel = () => {
    const option = speedOptions.find(opt => opt.value === currentSpeed);
    return option ? option.label : '1x';
  };

  const handleRemoveSilenceMouseEnter = () => {

    const audioElements = store.editorElements.filter(
      el => el.type === 'audio'
    );

    if (audioElements.length === 0 || isProcessingSilence) {
      return
    }

    isMouseOverRemoveSilenceButtonRef.current = true;

    if (removeSilenceTimeoutRef.current) {
      clearTimeout(removeSilenceTimeoutRef.current);
    }

    removeSilenceTimeoutRef.current = setTimeout(() => {

      let targetAudioId = selectedAudioForSilence;

      if (
        !targetAudioId ||
        !audioElements.find(el => el.id === targetAudioId)
      ) {

        const voiceAudio = audioElements.find(
          el => el.properties?.audioType === 'voice'
        );
        const anyAudio = audioElements[0];
        targetAudioId = voiceAudio?.id || anyAudio?.id;
        setSelectedAudioForSilence(targetAudioId);
      }


      selectedAudioIdRef.current = targetAudioId;
      const btnNode = removeSilenceButtonRef.current;
      if (btnNode) {
        const { top, left, height, width } = btnNode.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;


        const estimatedMenuWidth = 280;
        const estimatedMenuHeight = 400;


        let menuX = left + width / 2 - estimatedMenuWidth / 2;
        let menuY = top - estimatedMenuHeight - 8


        if (menuX < 0) {
          menuX = 8
        }


        if (menuX + estimatedMenuWidth > viewportWidth) {
          menuX = viewportWidth - estimatedMenuWidth - 8
        }


        if (menuY < 0) {

          menuY = top + height + 8
        }


        if (menuY + estimatedMenuHeight > viewportHeight) {
          menuY = Math.max(8, viewportHeight - estimatedMenuHeight - 8);
        }

        setRemoveSilenceMenuCoords({
          x: menuX,
          y: menuY,
        });
      }

      setIsRemoveSilenceVisible(true);
    }, 200);
  };

  const handleRemoveSilenceMouseLeave = () => {
    isMouseOverRemoveSilenceButtonRef.current = false;

    if (removeSilenceTimeoutRef.current) {
      clearTimeout(removeSilenceTimeoutRef.current);
    }

    removeSilenceTimeoutRef.current = setTimeout(() => {
      if (
        !isMouseOverRemoveSilenceMenuRef.current &&
        !isMouseOverRemoveSilenceButtonRef.current
      ) {
        setIsRemoveSilenceVisible(false);
      }
    }, 100);
  };

  const handleRemoveSilenceMenuMouseEnter = () => {
    isMouseOverRemoveSilenceMenuRef.current = true;

    if (removeSilenceTimeoutRef.current) {
      clearTimeout(removeSilenceTimeoutRef.current);
    }
  };

  const handleRemoveSilenceMenuMouseLeave = () => {
    isMouseOverRemoveSilenceMenuRef.current = false;

    if (removeSilenceTimeoutRef.current) {
      clearTimeout(removeSilenceTimeoutRef.current);
    }


    removeSilenceTimeoutRef.current = setTimeout(() => {
      if (!isMouseOverRemoveSilenceButtonRef.current) {
        setIsRemoveSilenceVisible(false);
      }
    }, 250);
  };

  const handleRemoveSilenceClose = () => {
    setIsRemoveSilenceVisible(false);
  };

  const handleRemoveSilenceClick = () => {

    const audioElements = store.editorElements.filter(
      el => el.type === 'audio'
    );

    if (audioElements.length === 0) {
      return
    }


    if (isRemoveSilenceVisible) {
      setIsRemoveSilenceVisible(false);
      return;
    }


    let targetAudioId = selectedAudioForSilence;

    if (!targetAudioId || !audioElements.find(el => el.id === targetAudioId)) {

      const voiceAudio = audioElements.find(
        el => el.properties?.audioType === 'voice'
      );
      const anyAudio = audioElements[0];
      targetAudioId = voiceAudio?.id || anyAudio?.id;
      setSelectedAudioForSilence(targetAudioId);


      const selectedAudio = voiceAudio || anyAudio;
      store.setSelectedElement(selectedAudio);
    }


    selectedAudioIdRef.current = targetAudioId;


    const btnNode = removeSilenceButtonRef.current;
    if (btnNode) {
      const { top, left, height, width } = btnNode.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;


      const estimatedMenuWidth = 280;
      const estimatedMenuHeight = 400;


      let menuX = left + width / 2 - estimatedMenuWidth / 2;
      let menuY = top - estimatedMenuHeight - 8;


      if (menuX < 8) {
        menuX = 8;
      }


      if (menuX + estimatedMenuWidth > viewportWidth - 8) {
        menuX = viewportWidth - estimatedMenuWidth - 8;
      }


      if (menuY < 8) {
        menuY = top + height + 8;
      }


      if (menuY + estimatedMenuHeight > viewportHeight) {
        menuY = Math.max(8, viewportHeight - estimatedMenuHeight - 8);
      }

      setRemoveSilenceMenuCoords({
        x: menuX,
        y: menuY,
      });
    }

    setIsRemoveSilenceVisible(true);
  };

  const handleRemoveSilenceApply = async (settings, audioId) => {

    let audioElement = null;
    if (audioId) {
      audioElement = store.editorElements.find(
        el => el.id === audioId && el.type === 'audio'
      );
    }

    if (!audioElement) {
      console.error('❌ No audio element available to process');
      return;
    }

    setIsProcessingSilence(true);

    setIsRemoveSilenceVisible(true);


    const loadingElement = {
      ...audioElement,
      isLoading: true,
    };
    store.updateEditorElement(loadingElement);

    try {
      const audioUrl = audioElement.src || audioElement.properties?.src;

      if (!audioUrl) {
        throw new Error('Audio URL not found');
      }

      const response = await removeSilence({
        audioUrl,
        startThreshold: settings.startThreshold,
        stopThreshold: settings.stopThreshold,
        stopDuration: settings.stopDuration,
        startDuration: settings.startDuration,
      });

      if (response.success && response.processedAudioUrl) {

        const newDuration =
          response.duration?.processedMs || audioElement.duration;
        const currentStartTime =
          audioElement.timeFrame?.start || audioElement.from || 1;


        const updatedElement = {
          ...audioElement,
          duration: newDuration,
          isLoading: false,
          timeFrame: {
            start: currentStartTime,
            end: currentStartTime + newDuration,
          },
          properties: {
            ...audioElement.properties,
            src: response.processedAudioUrl,
            originalAudioUrl: response.originalAudioUrl,
            silenceRemovalStats: response.statistics,
            silenceRemovalSettings: response.settings,
            durationInfo: response.duration,
          },
        };


        runInAction(() => {
          store.updateEditorElement(updatedElement);


          const htmlAudioElement = document.getElementById(
            audioElement.properties.elementId
          );
          if (htmlAudioElement) {
            htmlAudioElement.src = response.processedAudioUrl;
            htmlAudioElement.load()
          }


          store.editorElements = [...store.editorElements];


          if (settings.syncImages) {

            const originalAudioDuration = audioElement.duration;
            const compressionRatio = newDuration / originalAudioDuration;


            let imageElements = store.editorElements.filter(
              el => el.type === 'imageUrl' && el.row === audioElement.row
            );


            if (imageElements.length === 0) {
              imageElements = store.editorElements.filter(
                el => el.type === 'imageUrl'
              );
            }


            imageElements.forEach(imageElement => {
              const originalStart = imageElement.timeFrame.start;
              const originalEnd = imageElement.timeFrame.end;
              const originalImageDuration = originalEnd - originalStart;


              const newStart = originalStart * compressionRatio;
              const newEnd =
                newStart + originalImageDuration * compressionRatio;

              const updatedImageElement = {
                ...imageElement,
                timeFrame: {
                  start: newStart,
                  end: newEnd,
                },
              };

              store.updateEditorElement(updatedImageElement);
            });
          }


          const audioEndTime = currentStartTime + newDuration;
          const maxElementTime = Math.max(
            ...store.editorElements.map(el => el.timeFrame?.end || 0),
            audioEndTime
          );

          if (maxElementTime < store.maxTime) {

            const newMaxTime = Math.max(
              maxElementTime + 5000,
              newDuration + 10000
            );
            store.setMaxTime(newMaxTime);
          }


          store.refreshElements();
        });


        setIsRemoveSilenceVisible(false);
      } else {
        throw new Error(response.message || 'Failed to remove silence');
      }
    } catch (error) {
      console.error('❌ Error removing silence:', error);


      const errorElement = {
        ...audioElement,
        isLoading: false,
      };
      store.updateEditorElement(errorElement);
    } finally {
      setIsProcessingSilence(false);
    }
  };

  const handleScaleChange = e => {
    const value = parseFloat(e.target.value);
    onScaleChange?.(value);
    const percentage = Math.round(((value - 1) / (30 - 1)) * 100);
    e.target.style.setProperty('--range-progress', `${percentage}%`);
    document.documentElement.style.setProperty('--scale-factor', value);
  };


  const inferUploadCategory = (file) => {
    const ft = (file.type || '').toLowerCase();
    if (ft.startsWith('image/')) return 'image';
    if (ft.startsWith('video/')) return 'video';
    if (ft.startsWith('audio/')) return 'audio';
    const n = (file.name || '').toLowerCase();

    if (/\.(png|jpe?g|gif|bmp|webp|svg|ico|tiff?)$/i.test(n)) return 'image';

    if (/\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v|3gp|ogv)$/i.test(n)) return 'video';

    if (/\.(mp3|wav|aac|flac|aiff|ogg|m4a|wma|opus)$/i.test(n)) return 'audio';
    return null
  };


  const checkVideoHasAudio = (videoUrl) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = false;
      video.volume = 0.01
      
      const checkAudio = () => {

        const hasAudio = video.mozHasAudio || 
                        video.webkitAudioDecodedByteCount > 0 ||
                        video.audioTracks?.length > 0 ||

                        true
        resolve(hasAudio);
        video.remove();
      };

      video.addEventListener('loadedmetadata', checkAudio);
      video.addEventListener('error', () => {
        resolve(false);
        video.remove();
      });
      
      video.src = videoUrl;
    });
  };

  const getFileType = file => {
    const fileNameParts = file.name.split('.');
    if (fileNameParts.length > 1) {
      const extension = fileNameParts[fileNameParts.length - 1];
      return extension.toUpperCase();
    }
    const fileExtension = file.type.split('/')[1];
    if (fileExtension) {
      return fileExtension.toUpperCase();
    }
    return 'FILE';
  };



  const findVideoImageRow = () => {

    for (let row = 0; row < store.maxRows; row++) {
      const rowElements = store.getElementsInRow(row);
      const hasImage = rowElements.some(
        el => el.type === 'image' || el.type === 'imageUrl'
      );
      if (hasImage) {
        return row
      }
    }
    

    for (let row = 0; row < store.maxRows; row++) {
      const rowElements = store.getElementsInRow(row);
      const hasVideo = rowElements.some(
        el => el.type === 'video'
      );
      if (hasVideo) {
        return row
      }
    }
    

    return store.maxRows;
  };


  const findLastElementEndTime = (row) => {
    const rowElements = store.getElementsInRow(row);
    if (rowElements.length === 0) {
      return 0
    }
    

    const lastElement = rowElements.reduce((latest, current) => {
      return current.timeFrame.end > latest.timeFrame.end ? current : latest;
    }, rowElements[0]);
    
    return lastElement.timeFrame.end;
  };


  const findAudioRow = () => {

    for (let row = 0; row < store.maxRows; row++) {
      const rowElements = store.getElementsInRow(row);
      const hasAudio = rowElements.some(
        el => el.type === 'audio' || el.type === 'sound'
      );
      if (hasAudio) {
        return row;
      }
    }

    return store.maxRows;
  };

  const addFileToTimeline = async (file, uploadedUrl) => {
    const fileType = inferUploadCategory(file);
    
    if (!fileType) {
      toast.error(`Unsupported file type: ${file.name}. Please use image, video, or audio files.`);
      return;
    }

    try {
      if (fileType === 'image') {

        const targetRow = findVideoImageRow();
        if (targetRow === store.maxRows) {
          store.shiftRowsDown(targetRow);
        }
        

        const lastElementEndTime = findLastElementEndTime(targetRow);
        const startTime = lastElementEndTime
        

        const imageUrl = uploadedUrl;
        await store.addImageLocal({
          url: imageUrl,
          minUrl: imageUrl,
          row: targetRow,
          startTime: startTime,
        });
        toast.success(`Added ${file.name} to timeline`);
      } else if (fileType === 'audio') {

        const targetRow = findAudioRow();
        if (targetRow === store.maxRows) {
          store.shiftRowsDown(targetRow);
        }
        

        const lastElementEndTime = findLastElementEndTime(targetRow);
        const startTime = lastElementEndTime
        

        const audio = new Audio();
        const audioDuration = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout loading audio metadata'));
          }, 10000)
          
          audio.addEventListener('loadedmetadata', () => {
            clearTimeout(timeout);
            resolve(audio.duration * 1000)
          });
          audio.addEventListener('error', (e) => {
            clearTimeout(timeout);
            reject(new Error('Failed to load audio metadata'));
          });
          audio.src = uploadedUrl;
        });

        store.addExistingAudio({
          base64Audio: uploadedUrl,
          durationMs: audioDuration,
          row: targetRow,
          startTime: startTime,
          audioType: 'music',
          duration: audioDuration,
          id: Date.now() + Math.random().toString(36).substring(2, 9),
        });
        toast.success(`Added ${file.name} to timeline`);
      } else if (fileType === 'video') {

        const targetRow = findVideoImageRow();
        if (targetRow === store.maxRows) {
          store.shiftRowsDown(targetRow);
        }
        

        const audioRow = findAudioRow();
        const audioRowElements = audioRow < store.maxRows ? store.getElementsInRow(audioRow) : [];
        

        const lastElementEndTime = findLastElementEndTime(targetRow);
        




        let videoStartTime = lastElementEndTime;
        
        if (audioRowElements.length > 0) {

          const lastAudioElement = audioRowElements.reduce((latest, current) => {
            return current.timeFrame.start > latest.timeFrame.start ? current : latest;
          }, audioRowElements[0]);
          


          if (lastAudioElement.timeFrame.start > lastElementEndTime) {
            videoStartTime = lastAudioElement.timeFrame.start;
          }


        }
        

        const video = document.createElement('video');
        const videoDuration = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout loading video metadata'));
          }, 15000)
          
          video.addEventListener('loadedmetadata', () => {
            clearTimeout(timeout);
            resolve(video.duration * 1000)
          });
          video.addEventListener('error', (e) => {
            clearTimeout(timeout);
            reject(new Error('Failed to load video metadata'));
          });
          video.preload = 'metadata';
          video.src = uploadedUrl;
        });


        const hasAudio = await checkVideoHasAudio(uploadedUrl);


        await store.handleVideoUploadFromUrl({
          url: uploadedUrl,
          title: file.name,
          key: null,
          duration: videoDuration,
          row: targetRow,
          startTime: videoStartTime,
          isNeedLoader: false,
        });



        if (hasAudio) {

          const audioRowForVideo = findAudioRow();
          if (audioRowForVideo === store.maxRows) {
            store.shiftRowsDown(audioRowForVideo);
          }



          const audioStartTime = videoStartTime;

          store.addExistingAudio({
            base64Audio: uploadedUrl,
            durationMs: videoDuration,
            row: audioRowForVideo,
            startTime: audioStartTime,
            audioType: 'music',
            duration: videoDuration,
            id: `audio-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          });
        }

        toast.success(`Added ${file.name} to timeline${hasAudio ? ' with audio track' : ''}`);
      }
      

      store.refreshElements();
    } catch (error) {
      console.error('Error adding file to timeline:', error);
      toast.error(`Failed to add ${file.name} to timeline: ${error.message || 'Unknown error'}`);
    }
  };

  const processSelectedFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) {
      toast.error('No files selected');
      return;
    }

    setIsUploadingFiles(true);

    const accepted = [];
    const rejected = [];
    for (const f of list) {

      const fileType = inferUploadCategory(f);
      if (!fileType) {
        rejected.push({ 
          file: f, 
          reason: 'Unsupported file type. Please use image, video, or audio files.' 
        });
        continue;
      }
      

      const maxSize = 500 * 1024 * 1024
      if (f.size > maxSize) {
        rejected.push({ 
          file: f, 
          reason: `File too large (max ${Math.round(maxSize / 1024 / 1024)}MB)` 
        });
        continue;
      }

      const res = validateFile(f, 'All');
      if (res.ok) {
        accepted.push(f);
      } else {
        rejected.push({ file: f, reason: res.reason });
      }
    }

    if (rejected.length) {
      const head = rejected.slice(0, 3).map(r => `${r.file.name} — ${r.reason}`).join(', ');
      toast.error(`Some files were rejected: ${head}${rejected.length > 3 ? '…' : ''}`);
    }

    if (!accepted.length) {
      setIsUploadingFiles(false);
      return;
    }

    const newUploadingFiles = accepted.map(file => ({
      id: Date.now() + Math.random().toString(36).substring(2, 9),
      file,
      name: file.name,
      progress: 0,
      size: formatFileSize(file.size),
      type: getFileType(file),
      error: false,
    }));

    const initialProgress = {};
    newUploadingFiles.forEach(fileData => {
      initialProgress[fileData.id] = { progress: 0 };
    });
    setUploadProgress(prev => ({ ...prev, ...initialProgress }));

    for (const fileData of newUploadingFiles) {
      let uploadedUrl = null;
      let uploadSuccess = false;

      try {
        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('name', fileData.name);
        formData.append('type', inferUploadCategory(fileData.file));

        const response = await upload(formData, {
          onProgress: pct => {
            setUploadProgress(prev => ({
              ...prev,
              [fileData.id]: { progress: Math.max(prev[fileData.id]?.progress || 0, Math.min(100, pct)) },
            }));
          },
        });

        setUploadProgress(prev => ({
          ...prev,
          [fileData.id]: { progress: 100 },
        }));


        if (response?.data?.file?.url) {
          uploadedUrl = response.data.file.url;
          uploadSuccess = true;
        } else if (response?.data?.url) {
          uploadedUrl = response.data.url;
          uploadSuccess = true;
        }
      } catch (e) {
        const canceled = e?.canceled;
        const isAuthError = e?.response?.status === 401 || e?.error?.response?.status === 401;
        
        if (!canceled) {
          console.error('Upload error:', e);
          

          if (isAuthError) {
            console.warn('Upload failed due to authentication. Using local file instead.');
            uploadedUrl = URL.createObjectURL(fileData.file);
            uploadSuccess = true
            toast(`Using local file for ${fileData.name} (upload unavailable)`, { icon: '⚠️' });
          } else {

            uploadedUrl = URL.createObjectURL(fileData.file);
            uploadSuccess = true;
            toast(`Using local file for ${fileData.name} (upload failed)`, { icon: '⚠️' });
          }
        }
        
        setUploadProgress(prev => ({
          ...prev,
          [fileData.id]: { progress: 100, error: !uploadSuccess && !canceled },
        }));
      }


      if (uploadSuccess && uploadedUrl) {
        try {
          console.log('Adding file to timeline:', fileData.name, 'URL:', uploadedUrl);
          await addFileToTimeline(fileData.file, uploadedUrl);
          console.log('Successfully added file to timeline:', fileData.name);
        } catch (error) {
          console.error('Error adding file to timeline:', error);
          toast.error(`Failed to add ${fileData.name} to timeline: ${error.message || 'Unknown error'}`);

          if (uploadedUrl && uploadedUrl.startsWith('blob:')) {
            URL.revokeObjectURL(uploadedUrl);
          }
        }
      } else if (!uploadSuccess && !canceled) {
        console.error('Upload failed and no fallback available for:', fileData.name);
        toast.error(`Failed to process ${fileData.name}. Please try again.`);
      }
    }

    setIsUploadingFiles(false);

    setTimeout(() => {
      setUploadProgress({});
    }, 2000);
  };

  const handleUploadClick = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = getAcceptAttribute('All')
    fileInput.style.display = 'none';

    fileInput.onchange = async e => {
      await processSelectedFiles(e.target.files);
    };

    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
  };

  const checkedCount = checkedStates.filter(state => state).length;

  return (
    <div className={styles.timelineControls} ref={timelineControlsRef}>
      {/* Center area indicator */}
      <div style={getCenterAreaStyles()} />

      {/* Drop zone */}
      <div ref={drop} className={styles.dropZone} style={getDropZoneStyles()} />

      {/* Draggable controls container */}
      <div
        ref={node => {
          timelineControlsOptionsRef.current = node;
        }}
        className={`${styles.timelineControlsOptions} ${
          checkedCount < 1 ? styles.reducedGap : ''
        } ${isDragging ? styles.dragging : ''}`}
        style={{
          ...getPositionStyles(),
          opacity: isDragging ? 0.5 : 1,
          transition: 'all 0.2s ease',
        }}
      >
        <div className={styles.timelineControlsItem}>
          <div
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '7px',
              borderRadius: '4px',
              transition: 'all 0.2s ease',
              backgroundColor: 'transparent',
            }}
            onMouseDown={handleDragStart}
          >
            <ButtonWithIcon
              icon="DragIcon"
              size="12"
              color={isDragging ? 'white' : '#FFFFFF33'}
              accentColor="#FFFFFF90"
              activeColor="white"
              classNameButton={styles.dragIcon}
              tooltipText="Drag to reorder"
            />
          </div>
          <div className={styles.settingsContainer}>
            <ButtonWithIcon
              icon="GearIcon"
              size="17"
              color={isSettingsMenuVisible ? 'white' : '#FFFFFF66'}
              classNameButton={styles.settingsButton}
              tooltipText="Settings"
              tooltipPlace="left"
              onMouseEnter={() => {

                if (settingsMenuTimeoutRef.current) {
                  clearTimeout(settingsMenuTimeoutRef.current);
                }
                settingsMenuTimeoutRef.current = setTimeout(() => {
                  setIsSettingsMenuVisible(true);
                }, 300);
              }}
              onMouseLeave={() => {

                if (settingsMenuTimeoutRef.current) {
                  clearTimeout(settingsMenuTimeoutRef.current);
                  settingsMenuTimeoutRef.current = null;
                }

                setTimeout(() => {
                  const menuElement = settingsMenuRef.current;
                  if (menuElement && menuElement.matches(':hover')) {
                    return;
                  }
                  setIsSettingsMenuVisible(false);
                }, 300);
              }}
            />
            {isSettingsMenuVisible && (
              <ReusablePopup
                ref={settingsMenuRef}
                menuOptions={settingsMenuOptions}
                hasCheckbox={true}
                checkedStates={checkedStates}
                toggleCheckbox={onToggleCheckbox}
                onMouseEnter={() => setIsSettingsMenuVisible(true)}
                onMouseLeave={() => setIsSettingsMenuVisible(false)}
                highlightSelected={false}
                isNearRightEdge={isNearRightEdge()}
              />
            )}
          </div>
          {getCheckedStateByName('Volume Control') && (
            <div
              className={`${styles.volumeControlNew} ${
                isVolumeControlClicked ? styles.clicked : ''
              } ${isSelectedElementsAudio ? styles.audioElementSelected : ''}`}
              onMouseEnter={() => setIsVolumeControlHovered(true)}
              onMouseLeave={() => {
                setIsVolumeControlHovered(false);
                setIsVolumeControlClicked(false);
              }}
              onMouseDown={() => setIsVolumeControlClicked(true)}
              onMouseUp={() => setIsVolumeControlClicked(false)}
            >
              <ButtonWithIcon
                icon={isMuted ? 'MuteIcon' : 'VolumeIcon'}
                size="12"
                color={
                  isSelectedElementsAudio
                    ? 'var(--accent-color)'
                    : isVolumeControlClicked
                    ? 'white'
                    : isVolumeControlHovered
                    ? '#FFFFFFB2'
                    : isMuted
                    ? '#FFFFFF66'
                    : '#FFFFFFB2'
                }
                opacity={
                  isSelectedElementsAudio ||
                  isVolumeControlHovered ||
                  isVolumeControlClicked
                    ? 1
                    : 0.4
                }
                accentColor={
                  isSelectedElementsAudio ? 'var(--accent-color)' : '#FFFFFFB2'
                }
                activeColor="white"
                classNameButton={styles.scaleButton}
                tooltipText={
                  isSelectedElementsAudio
                    ? `${isMuted ? 'Unmute' : 'Adjust'} audio elements volume`
                    : `${isMuted ? 'Unmute' : 'Mute'} global audio`
                }
                onClick={onMuteToggle}
              />
              <div
                className={styles.scaleRangeInputBox}
                ref={volumeContainerRef}
              >
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={currentVolume}
                  onChange={onVolumeChange}
                  className={`${styles.volumeRange} ${
                    isSelectedElementsAudio ? styles.audioElementSelected : ''
                  }`}
                  style={{
                    '--range-progress': `${currentVolume}%`,
                    '--range-accent-color': isSelectedElementsAudio
                      ? 'var(--accent-color)'
                      : '#FFFFFFB2',
                  }}
                  onMouseDown={() => setIsVolumeControlClicked(true)}
                  onMouseUp={() => setIsVolumeControlClicked(false)}
                />
                <input
                  type="number"
                  min="0"
                  max="200"
                  value={Math.round(currentVolume * 2)}
                  ref={volumeNumberRef}
                  onChange={e => {
                    const inputValue = parseInt(e.target.value) || 0;
                    const value = Math.min(100, Math.max(0, inputValue / 2));
                    onVolumeChange({
                      target: { value },
                    });
                  }}
                  className={`${styles.scalePercentage} ${
                    isSelectedElementsAudio ? styles.audioElementSelected : ''
                  }`}
                  onMouseDown={() => setIsVolumeControlClicked(true)}
                  onMouseUp={() => setIsVolumeControlClicked(false)}
                />
              </div>
            </div>
          )}
        </div>
        {getCheckedStateByName('Reset') && (
          <ButtonWithIcon
            size="14"
            color="#FFFFFF66"
            accentColor="var(--accent-color)"
            marginLeft="0px"
            text={'Reset'}
            classNameButton={styles.resetButton}
            onClick={onReset}
          />
        )}
        {getCheckedStateByName('Playback Speed') && (
          <div className={styles.speedContainer}>
            <ButtonWithIcon
              text={getCurrentSpeedLabel()}
              color="#FFFFFF66"
              classNameButton={styles.speedButton}
              tooltipText="Speed"
              tooltipPlace="bottom"
              marginLeft="0px"
              onMouseEnter={() => {

                if (speedControlTimeoutRef.current) {
                  clearTimeout(speedControlTimeoutRef.current);
                }
                speedControlTimeoutRef.current = setTimeout(() => {
                  setIsSpeedControlVisible(true);
                }, 150);
              }}
              onMouseLeave={() => {

                if (speedControlTimeoutRef.current) {
                  clearTimeout(speedControlTimeoutRef.current);
                  speedControlTimeoutRef.current = null;
                }

                setTimeout(() => {
                  const menuElement = speedControlRef.current;
                  if (menuElement && menuElement.matches(':hover')) {
                    return;
                  }
                  setIsSpeedControlVisible(false);
                }, 150);
              }}
            />
            {isSpeedControlVisible && (
              <ReusablePopup
                ref={speedControlRef}
                menuOptions={speedOptions}
                onClickMethod={handleSpeedChange}
                selectedValue={currentSpeed}
                onMouseEnter={() => setIsSpeedControlVisible(true)}
                onMouseLeave={() => setIsSpeedControlVisible(false)}
                className="speedControlDropdown"
                minWidth="39px"
                alignCenter={true}
                isNearRightEdge={isNearRightEdge()}
              />
            )}
          </div>
        )}
        {getCheckedStateByName('Undo/ Redo') && (
          <div className={styles.undoRedoBtnSet}>
            <ButtonWithIcon
              icon="UndoIcon"
              size="19"
              accentColor="#FFFFFFB2"
              color="#FFFFFF66"
              activeColor="white"
              classNameButton={`${styles.undoRedoBtn} ${
                isUndoRedoLoading ? styles.disabled : ''
              }`}
              classNameIcon={styles.scaleIcon}
              onClick={onUndo}
              tooltipText="Undo"
            />

            <ButtonWithIcon
              icon="RedoIcon"
              size="19"
              accentColor="#FFFFFFB2"
              color="#FFFFFF66"
              activeColor="white"
              classNameButton={`${styles.undoRedoBtn} ${
                isUndoRedoLoading ? styles.disabled : ''
              }`}
              onClick={onRedo}
              tooltipText="Redo"
            />
          </div>
        )}
        {getCheckedStateByName('Transitions') && (
          <ButtonWithIcon
            icon="TransitionsIcon"
            size="15"
            accentColor="#FFFFFFB2"
            color="#FFFFFF66"
            activeColor="white"
            marginLeft="0px"
            classNameButton={styles.transitionsButton}
            onClick={() => {}}
            tooltipText="Transitions"
          />
        )}

        {getCheckedStateByName('Cut') && (
          <ButtonWithIcon
            icon="CutIcon"
            size="13"
            color={isCutMode ? 'var(--accent-color)' : '#FFFFFF66'}
            activeColor="var(--accent-color)"
            accentColor="#FFFFFFB2"
            classNameButton={`${styles.cutButton} ${
              isCutMode ? styles.active : ''
            }`}
            tooltipText="Cut"
            onClick={onCutToggle}
          />
        )}
        {getCheckedStateByName('Remove silence') && (
          <span ref={removeSilenceButtonRef}>
            <ButtonWithIcon
              icon="RemoveSilenceIcon"
              size="26"
              onClick={handleRemoveSilenceClick}
              color={
                store.editorElements.filter(el => el.type === 'audio').length >
                0
                  ? isProcessingSilence
                    ? 'var(--accent-color)'
                    : isRemoveSilenceVisible
                    ? 'white'
                    : '#FFFFFF66'
                  : '#FFFFFF33'
              }
              accentColor="#FFFFFFB2"
              activeColor="white"
              classNameButton={`${styles.removeSilenceBtn} ${
                isProcessingSilence ? styles.processing : ''
              } ${
                store.editorElements.filter(el => el.type === 'audio')
                  .length === 0
                  ? styles.disabled
                  : ''
              } ${isRemoveSilenceVisible ? styles.active : ''}`}
              tooltipText={
                store.editorElements.filter(el => el.type === 'audio')
                  .length === 0
                  ? 'No audio elements available'
                  : isProcessingSilence
                  ? 'Processing...'
                  : 'Remove Silence'
              }
            />
          </span>
        )}
        {getCheckedStateByName('Compact audio') && (
          <ButtonWithIcon
            icon="CompactIcon"
            size="26"
            accentColor="#FFFFFFB2"
            activeColor="white"
            color="#FFFFFF66"
            classNameButton={styles.compactAudioBtn}
            onClick={onCompactAudio}
            tooltipText="Compact Audio"
          />
        )}
        <ButtonWithIcon
          icon="UploadFileIcon"
          size="16"
          accentColor="#FFFFFFB2"
          activeColor="white"
          color={isUploadingFiles || isUploading ? 'var(--accent-color)' : '#FFFFFF66'}
          classNameButton={`${styles.uploadBtn} ${
            isUploadingFiles || isUploading ? styles.uploading : ''
          }`}
          onClick={handleUploadClick}
          tooltipText={
            isUploadingFiles || isUploading 
              ? 'Uploading files...' 
              : 'Upload files to timeline'
          }
          disabled={isUploadingFiles || isUploading}
        />
        {checkedStates.some(state => state) && (
          <div className={styles.dividerContainer}>
            <span className={styles.divider}></span>
          </div>
        )}
        {getCheckedStateByName('Zoom') && (
          <div
            className={`${styles.zoomControl} ${
              isZoomControlHovered ? styles.hovered : ''
            } ${isZoomControlClicked ? styles.clicked : ''}`}
            onMouseEnter={() => setIsZoomControlHovered(true)}
            onMouseLeave={() => {
              setIsZoomControlHovered(false);
              setIsZoomControlClicked(false);
            }}
            onMouseDown={() => setIsZoomControlClicked(true)}
            onMouseUp={() => setIsZoomControlClicked(false)}
          >
            <ButtonWithIcon
              icon="MagnifierOutIcon"
              size="18"
              color="#FFFFFF66"
              activeColor="white"
              accentColor="#FFFFFFB2"
              classNameButton={`${styles.zoomButton} ${
                isZoomControlClicked ? styles.active : ''
              }`}
              tooltipText="Zoom Out"
              onClick={() => {
                const newScale = Math.max(1, currentScale - 1);
                onScaleChange?.(newScale);
                const percentage = Math.round(
                  ((newScale - 1) / (30 - 1)) * 100
                );
                if (scaleRangeRef?.current) {
                  scaleRangeRef.current.style.setProperty(
                    '--range-progress',
                    `${percentage}%`
                  );
                }
                document.documentElement.style.setProperty(
                  '--scale-factor',
                  newScale
                );
              }}
            />
            <input
              type="range"
              min="1"
              max="30"
              step="0.5"
              value={currentScale}
              onChange={handleScaleChange}
              className={styles.zoomRange}
              ref={scaleRangeRef}
            />
            <ButtonWithIcon
              icon="MagnifierInIcon"
              size="18"
              color="#FFFFFF66"
              activeColor="white"
              accentColor="#FFFFFFB2"
              classNameButton={`${styles.zoomButton} ${
                isZoomControlClicked ? styles.active : ''
              }`}
              tooltipText="Zoom In"
              onClick={() => {
                const newScale = Math.min(30, currentScale + 1);
                onScaleChange?.(newScale);
                const percentage = Math.round(
                  ((newScale - 1) / (30 - 1)) * 100
                );
                if (scaleRangeRef?.current) {
                  scaleRangeRef.current.style.setProperty(
                    '--range-progress',
                    `${percentage}%`
                  );
                }
                document.documentElement.style.setProperty(
                  '--scale-factor',
                  newScale
                );
              }}
            />
          </div>
        )}

        {showMoreOptions && (
          <div className={styles.settingsContainer}>
            <ButtonWithIcon
              icon="ThreeDotsIcon"
              size="13"
              color="#FFFFFF66"
              classNameButton={styles.threeDotsButton}
              tooltipText="More Options"
              tooltipPlace="bottom"
              onMouseEnter={() => {

                if (moreMenuTimeoutRef.current) {
                  clearTimeout(moreMenuTimeoutRef.current);
                }
                moreMenuTimeoutRef.current = setTimeout(() => {
                  setIsMoreMenuVisible(true);
                }, 150);
              }}
              onMouseLeave={() => {

                if (moreMenuTimeoutRef.current) {
                  clearTimeout(moreMenuTimeoutRef.current);
                  moreMenuTimeoutRef.current = null;
                }

                setTimeout(() => {
                  const menuElement = moreMenuRef.current;
                  if (menuElement && menuElement.matches(':hover')) {
                    return;
                  }
                  setIsMoreMenuVisible(false);
                }, 150);
              }}
            />

            {isMoreMenuVisible && (
              <ReusablePopup
                ref={moreMenuRef}
                menuOptions={moreMenuOptions}
                hasIcon={true}
                onClickMethod={handleMoreMenuClick}
                onMouseEnter={() => setIsMoreMenuVisible(true)}
                onMouseLeave={() => setIsMoreMenuVisible(false)}
                isNearRightEdge={isNearRightEdge()}
              />
            )}
          </div>
        )}
      </div>

      {/* Remove Silence Menu Portal */}
      {isRemoveSilenceVisible && (
        <PopupPortal
          x={removeSilenceMenuCoords.x}
          y={removeSilenceMenuCoords.y}
        >
          <RemoveSilenceMenu
            ref={removeSilenceRef}
            onApply={handleRemoveSilenceApply}
            isProcessing={isProcessingSilence}
            onClose={handleRemoveSilenceClose}
            audioElements={store.editorElements.filter(
              el => el.type === 'audio'
            )}
            selectedAudioId={selectedAudioForSilence}
            onAudioSelect={setSelectedAudioForSilence}
          />
        </PopupPortal>
      )}
    </div>
  );
};

export default TimeLineControlPanel;
