import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import TimelineItem from './timeline-item';
import AnimationItem from './AnimationItem';
import TransitionVisualizer from './TransitionVisualizer';
import EffectVisualizer from './EffectVisualizer';
import GapIndicator from './GapIndicator';
import { StoreContext } from '../../mobx';
import { observer } from 'mobx-react';
import styles from './Timeline.module.scss';
import { GripIcon } from 'components/Icons';
import { useDrop, useDragDropManager } from 'react-dnd';
import { useDispatch, useSelector } from 'react-redux';
import { saveTimelineState } from '../../redux/timeline/timelineSlice';
import { uploadImage } from '../../utils/uploadImage';
import { ButtonWithIcon } from 'components/reusableComponents/ButtonWithIcon';
import { getUid } from 'utils';
import { uploadVideoToAWS } from '../../utils/awsUpload';
import { saveVideoData } from '../../utils/saveVideoMetadata';
import { user as selectUser } from '../../redux/auth/selectors';
import { Resizable } from 'react-resizable';
import toast from 'react-hot-toast';
import { handleCatchError } from '../../utils/errorHandler';

const areTypesCompatible = (type1, type2) => {
  const isType1Subtitle = type1 === 'text';
  const isType2Subtitle = type2 === 'text';

  if (isType1Subtitle || isType2Subtitle) {
    return isType1Subtitle && isType2Subtitle;
  }

  if (type1 === 'animation' || type2 === 'animation') {
    return true;
  }

  const mixableTypes = ['audio', 'video', 'imageUrl', 'image'];
  return mixableTypes.includes(type1) && mixableTypes.includes(type2);
};

const TimelineRow = observer(
  ({
    rowIndex,
    overlays,
    moveElementBetweenRows,
    toggleAnimations,
    handleActiveScene,
    storyData,
    rowId,
    defaultButton,
    isCutMode,
    setIsCutMode,
    scenes,
    onOpenTransitionPanel,
    onOpenEffectPanel,
  }) => {
    const [lastSwapTime, setLastSwapTime] = useState(null);
    const swapCooldown = 600;
    const minOverlapPercentage = 0.4;
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const [isDraggingFileOverDropZone, setIsDraggingFileOverDropZone] =
      useState(false);
    const [isDraggingFileOverTopDropZone, setIsDraggingFileOverTopDropZone] =
      useState(false);
    const [isDraggingTimelineElement, setIsDraggingTimelineElement] =
      useState(false);

    const dispatch = useDispatch();
    const dragDropManager = useDragDropManager();

    const rowType = overlays[0]?.type;

    const defaultHeight = useMemo(() => {
      const heights = {
        text: 28,
        image: 40,
        imageUrl: 40,
        audio: 36,
        transition: 24,
        video: 44,
        animation: 26,
      };
      return heights[rowType] || 32;
    }, [rowType]);

    const [rowHeight, setRowHeight] = useState(defaultHeight);

    useEffect(() => {
      setRowHeight(defaultHeight);
    }, [defaultHeight]);

    const handleRowResize = useCallback((event, { size }) => {
      const newHeight = Math.max(20, Math.min(200, Math.round(size.height)));
      setRowHeight(newHeight);
    }, []);
    useEffect(() => {
      const monitor = dragDropManager.getMonitor();

      const checkDragState = () => {
        const isDragging = monitor.isDragging();
        const itemType = monitor.getItemType();
        const isTimelineItem = itemType === 'timeline-item';

        if (isDragging && isTimelineItem) {
          setIsDraggingTimelineElement(true);
        } else {
          setIsDraggingTimelineElement(false);
        }
      };

      const unsubscribe = monitor.subscribeToStateChange(checkDragState);

      return () => {
        unsubscribe();
      };
    }, [dragDropManager]);

    const store = React.useContext(StoreContext);
    const user = useSelector(selectUser);
    const dropRef = useRef(null);
    const dragData = useRef({
      initialMouseX: 0,
      initialClickOffset: 0,
      initialRowId: null,
      draggedElementId: null,
    });

    const handleHover = useCallback(
      (draggedItem, monitor) => {
        const hoverBoundingRect = dropRef.current?.getBoundingClientRect();
        const clientOffset = monitor.getClientOffset();
        const initialClientOffset = monitor.getInitialClientOffset();
        const initialSourceClientOffset =
          monitor.getInitialSourceClientOffset();

        if (
          !hoverBoundingRect ||
          !clientOffset ||
          !initialClientOffset ||
          !initialSourceClientOffset
        )
          return;

        if (
          monitor.getItemType() === 'timeline-item' &&
          !store.ghostState.isDragging &&
          !store.ghostState.isMultiDragging
        ) {
          const element = store.editorElements.find(
            el => el.id === draggedItem.id
          );
          if (element) {
            const initialClickOffset =
              initialClientOffset.x - initialSourceClientOffset.x;
            store.startGhostDrag(element, initialClickOffset, 0, 'move');
          }
        }
        if (
          draggedItem.type === 'gallery-image' ||
          draggedItem.type === 'scene-image'
        ) {
          const nodeUnderPointer = document.elementFromPoint(
            clientOffset.x,
            clientOffset.y
          );
          const timelineItemEl = nodeUnderPointer?.closest(
            '[data-timeline-item]'
          );
          if (timelineItemEl) {
            let overlayId = timelineItemEl.getAttribute('data-overlay-id');
            if (!overlayId) {
              const idHolder =
                timelineItemEl.querySelector('[data-overlay-id]');
              overlayId = idHolder?.getAttribute('data-overlay-id') || null;
            }
            if (overlayId) {
              const overlay = store.editorElements.find(
                el => el.id === overlayId
              );
              if (overlay && overlay.type === 'imageUrl') {
                if (store.hideGalleryGhostOnItemHover) {
                  store.hideGalleryGhostOnItemHover();
                }
                return; 
              }
            } else {
             
              if (store.hideGalleryGhostOnItemHover) {
                store.hideGalleryGhostOnItemHover();
              }
              return;
            }
          }
        
          if (store.showGalleryGhostFromCache) {
            store.showGalleryGhostFromCache();
          }

          if (!store.ghostState.isGalleryDragging) {
            store.startGalleryGhostDrag(draggedItem.image, 'imageUrl', 5000);
          }

          const mouseX = clientOffset.x - hoverBoundingRect.left;
          const newPosition =
            (mouseX / hoverBoundingRect.width) * store.maxTime;
          const rowType = overlays[0]?.type;
          const isIncompatible =
            rowType && !areTypesCompatible(rowType, 'imageUrl');

          store.updateGalleryGhost(newPosition, rowIndex, isIncompatible);
          return;
        }

        if (
          draggedItem.type === 'gallery-video' ||
          draggedItem.type === 'scene-video'
        ) {
          
          const nodeUnderPointer = document.elementFromPoint(
            clientOffset.x,
            clientOffset.y
          );
          const timelineItemEl = nodeUnderPointer?.closest(
            '[data-timeline-item]'
          );
          if (timelineItemEl) {
            let overlayId = timelineItemEl.getAttribute('data-overlay-id');
            if (!overlayId) {
              const idHolder =
                timelineItemEl.querySelector('[data-overlay-id]');
              overlayId = idHolder?.getAttribute('data-overlay-id') || null;
            }
            if (overlayId) {
              const overlay = store.editorElements.find(
                el => el.id === overlayId
              );
              if (overlay && overlay.type === 'video') {
                if (store.hideGalleryGhostOnItemHover) {
                  store.hideGalleryGhostOnItemHover();
                }
                return
              }
            } else {
              if (store.hideGalleryGhostOnItemHover) {
                store.hideGalleryGhostOnItemHover();
              }
              return;
            }
          }
          if (store.showGalleryGhostFromCache) {
            store.showGalleryGhostFromCache();
          }

          if (!store.ghostState.isGalleryDragging) {
            const videoDuration = draggedItem.video?.duration || 10000;
            store.startGalleryGhostDrag(
              draggedItem.video,
              'video',
              videoDuration
            );
          }

          const mouseX = clientOffset.x - hoverBoundingRect.left;
          const newPosition =
            (mouseX / hoverBoundingRect.width) * store.maxTime;
          const rowType = overlays[0]?.type;
          const isIncompatible =
            rowType && !areTypesCompatible(rowType, 'video');

          store.updateGalleryGhost(newPosition, rowIndex, isIncompatible);
          return;
        }

        if (draggedItem.type === 'animation-effect') {
          if (!store.ghostState.isGalleryDragging) {
            const effectDuration = draggedItem.effect?.duration || 10000;
            store.startGalleryGhostDrag(
              draggedItem.effect,
              'video',
              effectDuration
            );
          }

          const mouseX = clientOffset.x - hoverBoundingRect.left;
          const newPosition =
            (mouseX / hoverBoundingRect.width) * store.maxTime;
          const rowType = overlays[0]?.type;
          const isIncompatible =
            rowType && !areTypesCompatible(rowType, 'video');

          store.updateGalleryGhost(newPosition, rowIndex, isIncompatible);
          return;
        }

        if (draggedItem.type === 'animation-drop') {
          if (!store.ghostState.isGalleryDragging) {
            const animationDuration = draggedItem.animation?.duration || 1000;
            store.startGalleryGhostDrag(
              draggedItem.animation,
              'animation',
              animationDuration
            );
          }

          const mouseX = clientOffset.x - hoverBoundingRect.left;
          const newPosition =
            (mouseX / hoverBoundingRect.width) * store.maxTime;


          const rowType = overlays[0]?.type;
          const isIncompatible = rowType && rowType === 'text'

          store.updateGalleryGhost(newPosition, rowIndex, isIncompatible);
          return;
        }

        if (draggedItem.type === 'gl-transition-drop') {
          if (!store.ghostState.isGalleryDragging) {
            const transitionDuration =
              draggedItem.glTransition?.duration || 1000;
            store.startGalleryGhostDrag(
              draggedItem.glTransition,
              'transition',
              transitionDuration
            );
          }

          const mouseX = clientOffset.x - hoverBoundingRect.left;
          const newPosition =
            (mouseX / hoverBoundingRect.width) * store.maxTime;


          const rowType = overlays[0]?.type;
          const isIncompatible = rowType && rowType === 'text'

          store.updateGalleryGhost(newPosition, rowIndex, isIncompatible);
          return;
        }

        const draggedElement = store.editorElements.find(
          el => el.id === draggedItem.id
        );
        if (!draggedElement) return;

        const selectedElements =
          store?.selectedElements &&
          Object.keys(store.selectedElements).length > 0
            ? Object.values(store.selectedElements)
                .filter(selected => selected && selected.id)
                .map(selected =>
                  store.editorElements.find(
                    element => element.id === selected.id
                  )
                )
                .filter(Boolean)
            : [];

        const draggedElementIsSelected = selectedElements.some(
          selected => selected.id === draggedItem.id
        );

        if (draggedElementIsSelected && selectedElements?.length > 1) {

          if (!store.ghostState.isMultiDragging) {

            const initialClickOffset =
              initialClientOffset.x - initialSourceClientOffset.x;
            store.startMultiGhostDrag(
              selectedElements,
              draggedElement,
              initialClickOffset
            );
          }


          if (store.ghostState.initialClientX === null) {
            store.ghostState.initialClientX = clientOffset.x;
          }

          const deltaX = clientOffset.x - store.ghostState.initialClientX;
          const deltaTime = (deltaX / hoverBoundingRect.width) * store.maxTime;
          const newPosition = Math.max(
            0,
            Math.min(
              store.maxTime,
              store.ghostState.initialElementStarts[
                store.ghostState.selectedElements.findIndex(
                  el => el.id === draggedElement.id
                )
              ] + deltaTime
            )
          );


          store.updateMultiGhostElements(newPosition);
          return
        } else {
          store.setSelectedElements(null);
        }

        const elementBelongsToRow = overlays.some(
          el => el.id === draggedItem.id
        );


        if (
          dragData.current.initialMouseX === 0 &&
          !store.ghostState.isDragging
        ) {
          if (!elementBelongsToRow) {
            const rowType = overlays[0]?.type;

            if (
              draggedElement.type !== rowType &&
              draggedElement.type !== 'animation'
            )
              return;
            return;
          }

          dragData.current = {
            initialMouseX: initialClientOffset.x,
            initialRowId: rowId,
            draggedElementId: draggedItem.id,
            initialClickOffset:
              initialClientOffset.x -
              hoverBoundingRect.left -
              (draggedElement.timeFrame.start / store.maxTime) *
                hoverBoundingRect.width,
          };
        }


        if (
          store.ghostState.isDragging &&
          store.ghostState.draggedElement &&
          !store.ghostState.isMultiDragging
        ) {
          const draggedElement = store.ghostState.draggedElement;
          const rowType = overlays[0]?.type;


          const isCompatible =
            !rowType |
            areTypesCompatible(rowType, draggedElement.type);

          const mouseX = clientOffset.x - hoverBoundingRect.left;


          if (store.ghostState.initialClientX === null) {

            store.ghostState.initialClientX = clientOffset.x;
          }

          const deltaX = clientOffset.x - store.ghostState.initialClientX;
          const deltaTime = (deltaX / hoverBoundingRect.width) * store.maxTime;
          const newPosition = Math.max(
            0,
            Math.min(
              store.maxTime,
              store.ghostState.initialElementStart + deltaTime
            )
          );



          if (draggedElement.type === 'animation') {
            store.updateAnimationGhostElementWithPush(
              newPosition,
              rowIndex,
              !isCompatible,
              draggedElement
            );
          } else {
            store.updateGhostElementWithPush(
              newPosition,
              rowIndex,
              !isCompatible,
              draggedElement
            );
          }
          return
        }
      },
      [
        rowId,
        rowIndex,
        overlays,
        store.maxTime,
        store.editorElements,
        store.ghostState.isDragging,
        store.ghostState.draggedElement,
      ]
    );

    const getAudioLengthFromUrl = async url => {
      return new Promise((resolve, reject) => {
        const audio = new Audio();
        audio.addEventListener('loadedmetadata', () => {
          resolve(audio.duration * 1000);
        });
        audio.addEventListener('error', reject);
        audio.src = url;
      });
    };


    const [{ isOver, canDrop }, drop] = useDrop({
      accept: [
        'timeline-item',
        'gallery-image',
        'scene-image',
        'gallery-video',
        'scene-video',
        'animation-effect',
        'animation-drop',
        'gl-transition-drop',
      ],
      hover: handleHover,
      drop: async (item, monitor) => {

        if (monitor.didDrop()) {
          return;
        }


        if (
          monitor.getItemType() === 'timeline-item' &&
          (store.ghostState.isDragging || store.ghostState.isMultiDragging)
        ) {
          const hoverBoundingRect = dropRef.current?.getBoundingClientRect();
          const clientOffset = monitor.getClientOffset();

          if (hoverBoundingRect && clientOffset) {

            if (store.ghostState.isMultiDragging) {
              const deltaX = clientOffset.x - store.ghostState.initialClientX;
              const deltaTime =
                (deltaX / hoverBoundingRect.width) * store.maxTime;
              const draggedIndex = store.ghostState.selectedElements.findIndex(
                el => el.id === store.ghostState.draggedElement.id
              );
              const finalPosition = Math.max(
                0,
                Math.min(
                  store.maxTime,
                  store.ghostState.initialElementStarts[draggedIndex] +
                    deltaTime
                )
              );

              store.finishMultiGhostDrag(finalPosition);
              return;
            }


            if (store.ghostState.isDragging) {
              const draggedElement = store.ghostState.draggedElement;
              const rowType = overlays[0]?.type;


              const isCompatible =
                !rowType |
                areTypesCompatible(rowType, draggedElement.type);

              if (isCompatible) {

                if (store.ghostState.initialClientX === null) {
                  store.ghostState.initialClientX = clientOffset.x;
                }

                const deltaX = clientOffset.x - store.ghostState.initialClientX;
                const deltaTime =
                  (deltaX / hoverBoundingRect.width) * store.maxTime;
                const finalPosition = Math.max(
                  0,
                  Math.min(
                    store.maxTime,
                    store.ghostState.initialElementStart + deltaTime
                  )
                );


                if (store.ghostState.isAnimationDrag) {
                  store.finishAnimationGhostDrag(finalPosition, rowIndex);
                } else {
                  store.finishGhostDrag(finalPosition, rowIndex);
                }
              }
            }
          }
          return;
        }

        if (item.type === 'gallery-image' || item.type === 'scene-image') {

          if (
            store.ghostState.isGalleryDragging &&
            store.ghostState.galleryGhostElement
          ) {
            const hoverBoundingRect = dropRef.current?.getBoundingClientRect();
            const clientOffset = monitor.getClientOffset();

            if (hoverBoundingRect && clientOffset) {
              const mouseX = clientOffset.x - hoverBoundingRect.left;
              const finalPosition =
                (mouseX / hoverBoundingRect.width) * store.maxTime;

              store.finishGalleryGhostDrag(
                finalPosition,
                rowIndex,
                async (startTime, targetRow) => {
                  const imageData = item.image;
                  await store.addImageLocal({
                    url: imageData.googleCloudUrl || imageData.url,
                    minUrl: imageData.minGoogleCloudUrl || imageData.minUrl,
                    row: targetRow,
                    startTime: startTime,
                  });
                }
              );
            }
            return;
          }


          const imageData = item.image;
          const rowElements = store.editorElements.filter(
            el => el.row === rowIndex
          );
          let startTime = 0;
          let hasSpace = true;

          if (rowElements.length > 0) {
            const sortedElements = [...rowElements].sort(
              (a, b) => a.timeFrame.start - b.timeFrame.start
            );
            hasSpace = false;

            for (let i = 0; i <= sortedElements.length; i++) {
              const currentStart =
                i === 0 ? 0 : sortedElements[i - 1].timeFrame.end;
              const nextStart =
                i === sortedElements.length
                  ? store.maxTime
                  : sortedElements[i].timeFrame.start;

              if (nextStart - currentStart >= 5000) {

                startTime = currentStart;
                hasSpace = true;
                break;
              }
            }
          }

          if (hasSpace) {
            await store.addImageLocal({
              url: imageData.googleCloudUrl || imageData.url,
              minUrl: imageData.minGoogleCloudUrl || imageData.minUrl,
              row: rowIndex,
              startTime: startTime,
            });
          } else {
            store.shiftRowsDown(rowIndex + 1);
            await store.addImageLocal({
              url: imageData.googleCloudUrl || imageData.url,
              minUrl: imageData.minGoogleCloudUrl || imageData.minUrl,
              row: rowIndex + 1,
              startTime: 0,
            });
          }
          return;
        }

        if (item.type === 'gallery-video' || item.type === 'scene-video') {

          if (
            store.ghostState.isGalleryDragging &&
            store.ghostState.galleryGhostElement
          ) {
            const hoverBoundingRect = dropRef.current?.getBoundingClientRect();
            const clientOffset = monitor.getClientOffset();

            if (hoverBoundingRect && clientOffset) {
              const mouseX = clientOffset.x - hoverBoundingRect.left;
              const finalPosition =
                (mouseX / hoverBoundingRect.width) * store.maxTime;

              store.finishGalleryGhostDrag(
                finalPosition,
                rowIndex,
                async (startTime, targetRow) => {
                  const videoData = item.video;


                  let videoUrl = videoData.url;
                  if (videoUrl && videoUrl.includes('videocdn.pollo.ai')) {
                    const path = videoUrl.replace(
                      'https://videocdn.pollo.ai/',
                      ''
                    );
                    videoUrl = `/api/proxy/video/${path}`;
                  }

                  await store.handleVideoUploadFromUrl({
                    url: videoUrl,
                    title: videoData.title || 'Video',
                    key: videoData.key || null,
                    duration: videoData.duration || null,
                    row: targetRow,
                    startTime: startTime,
                  });
                }
              );
            }
            return;
          }


          const videoData = item.video;
          const rowElements = store.editorElements.filter(
            el => el.row === rowIndex
          );
          let startTime = 0;
          let hasSpace = true;

          if (rowElements.length > 0) {
            const sortedElements = [...rowElements].sort(
              (a, b) => a.timeFrame.start - b.timeFrame.start
            );
            hasSpace = false;

            for (let i = 0; i <= sortedElements.length; i++) {
              const currentStart =
                i === 0 ? 0 : sortedElements[i - 1].timeFrame.end;
              const nextStart =
                i === sortedElements.length
                  ? store.maxTime
                  : sortedElements[i].timeFrame.start;


              if (nextStart - currentStart >= 10000) {
                startTime = currentStart;
                hasSpace = true;
                break;
              }
            }
          }

          if (hasSpace) {

            let videoUrl = videoData.url;
            if (videoUrl && videoUrl.includes('videocdn.pollo.ai')) {
              const path = videoUrl.replace('https://videocdn.pollo.ai/', '');
              videoUrl = `/api/proxy/video/${path}`;
            }

            await store.handleVideoUploadFromUrl({
              url: videoUrl,
              title: videoData.title || 'Video',
              key: videoData.key || null,
              duration: videoData.duration || null,
              row: rowIndex,
            });
          } else {

            let videoUrl = videoData.url;
            if (videoUrl && videoUrl.includes('videocdn.pollo.ai')) {
              const path = videoUrl.replace('https://videocdn.pollo.ai/', '');
              videoUrl = `/api/proxy/video/${path}`;
            }

            store.shiftRowsDown(rowIndex + 1);
            await store.handleVideoUploadFromUrl({
              url: videoUrl,
              title: videoData.title || 'Video',
              key: videoData.key || null,
              duration: videoData.duration || null,
              row: rowIndex + 1,
            });
          }
          return;
        }

        if (item.type === 'animation-effect') {

          if (
            store.ghostState.isGalleryDragging &&
            store.ghostState.galleryGhostElement
          ) {
            const hoverBoundingRect = dropRef.current?.getBoundingClientRect();
            const clientOffset = monitor.getClientOffset();

            if (hoverBoundingRect && clientOffset) {
              const mouseX = clientOffset.x - hoverBoundingRect.left;
              const finalPosition =
                (mouseX / hoverBoundingRect.width) * store.maxTime;

              store.finishGalleryGhostDrag(
                finalPosition,
                rowIndex,
                async (startTime, targetRow) => {
                  const effectData = item.effect;


                  let effectUrl = effectData.url;
                  if (effectUrl && effectUrl.includes('videocdn.pollo.ai')) {
                    const path = effectUrl.replace(
                      'https://videocdn.pollo.ai/',
                      ''
                    );
                    effectUrl = `/api/proxy/video/${path}`;
                  }

                  await store.handleVideoUploadFromUrl({
                    url: effectUrl,
                    title: effectData.title || 'Animation Effect',
                    key: effectData.key || null,
                    duration: effectData.duration || null,
                    row: targetRow,
                    startTime: startTime,
                  });

                  try {
                    const newlyAdded = store.editorElements
                      .slice()
                      .reverse()
                      .find(
                        el =>
                          el.type === 'video' &&
                          el.row === targetRow &&
                          el.properties?.src === effectData.url
                      );
                    if (newlyAdded) {
                      if (store.setSelectedElement) {
                        store.setSelectedElement(newlyAdded);
                      }
                      if (store.setSelectedElements) {
                        store.setSelectedElements({
                          ...[newlyAdded],
                          effect: newlyAdded.effect || 'in',
                        });
                      }
                    }
                  } catch (e) {
                    handleCatchError(
                      e,
                      'Auto-select effect video failed',
                      false
                    );
                  }
                }
              );
            }
            return;
          }


          const effectData = item.effect;
          const rowElements = store.editorElements.filter(
            el => el.row === rowIndex
          );
          let startTime = 0;
          let hasSpace = true;

          if (rowElements.length > 0) {
            const sortedElements = [...rowElements].sort(
              (a, b) => a.timeFrame.start - b.timeFrame.start
            );
            hasSpace = false;

            for (let i = 0; i <= sortedElements.length; i++) {
              const currentStart =
                i === 0 ? 0 : sortedElements[i - 1].timeFrame.end;
              const nextStart =
                i === sortedElements.length
                  ? store.maxTime
                  : sortedElements[i].timeFrame.start;


              if (nextStart - currentStart >= 10000) {
                startTime = currentStart;
                hasSpace = true;
                break;
              }
            }
          }

          if (hasSpace) {

            let effectUrl = effectData.url;
            if (effectUrl && effectUrl.includes('videocdn.pollo.ai')) {
              const path = effectUrl.replace('https://videocdn.pollo.ai/', '');
              effectUrl = `/api/proxy/video/${path}`;
            }

            await store.handleVideoUploadFromUrl({
              url: effectUrl,
              title: effectData.title || 'Animation Effect',
              key: effectData.key || null,
              duration: effectData.duration || null,
              row: rowIndex,
            });

            try {
              const newlyAdded = store.editorElements
                .slice()
                .reverse()
                .find(
                  el =>
                    el.type === 'video' &&
                    el.row === rowIndex &&
                    el.properties?.src === effectData.url
                );
              if (newlyAdded) {
                if (store.setSelectedElement) {
                  store.setSelectedElement(newlyAdded);
                }
                if (store.setSelectedElements) {
                  store.setSelectedElements({
                    ...[newlyAdded],
                    effect: newlyAdded.effect || 'in',
                  });
                }
              }
            } catch (e) {
              console.warn('Auto-select effect video failed', e);
            }
          } else {

            let effectUrl = effectData.url;
            if (effectUrl && effectUrl.includes('videocdn.pollo.ai')) {
              const path = effectUrl.replace('https://videocdn.pollo.ai/', '');
              effectUrl = `/api/proxy/video/${path}`;
            }

            store.shiftRowsDown(rowIndex + 1);
            await store.handleVideoUploadFromUrl({
              url: effectUrl,
              title: effectData.title || 'Animation Effect',
              key: effectData.key || null,
              duration: effectData.duration || null,
              row: rowIndex + 1,
            });

            try {
              const targetRow = rowIndex + 1;
              const newlyAdded = store.editorElements
                .slice()
                .reverse()
                .find(
                  el =>
                    el.type === 'video' &&
                    el.row === targetRow &&
                    el.properties?.src === effectData.url
                );
              if (newlyAdded) {
                if (store.setSelectedElement) {
                  store.setSelectedElement(newlyAdded);
                }
                if (store.setSelectedElements) {
                  store.setSelectedElements({
                    ...[newlyAdded],
                    effect: newlyAdded.effect || 'in',
                  });
                }
              }
            } catch (e) {
              console.warn('Auto-select effect video failed', e);
            }
          }
          return;
        }

        if (item.type === 'animation-drop') {
          console.log(
            'TimelineRow: animation-drop detected in drop handler',
            item
          );


          if (store.ghostState.isDragging && store.ghostState.isAnimationDrag) {
            console.log(
              'TimelineRow: Skipping animation-drop - this is an existing animation being moved'
            );
            return;
          }


          if (
            store.ghostState.isGalleryDragging &&
            store.ghostState.galleryGhostElement
          ) {
            console.log('TimelineRow: Using gallery ghost for animation-drop');
            const hoverBoundingRect = dropRef.current?.getBoundingClientRect();
            const clientOffset = monitor.getClientOffset();

            if (hoverBoundingRect && clientOffset) {
              const mouseX = clientOffset.x - hoverBoundingRect.left;
              const finalPosition =
                (mouseX / hoverBoundingRect.width) * store.maxTime;

              store.finishGalleryGhostDrag(
                finalPosition,
                rowIndex,
                async (startTime, targetRow) => {
                  console.log('TimelineRow: finishGalleryGhostDrag callback', {
                    startTime,
                    targetRow,
                  });
                  const animationData = item.animation;
                  console.log('TimelineRow: animationData', animationData);


                  const actualType =
                    animationData.unifiedType || animationData.type;
                  const actualProperties =
                    animationData.unifiedProperties ||
                    animationData.properties ||
                    {};


                  const newAnimation = {
                    id: getUid(),
                    type: actualType,
                    duration:
                      actualProperties.duration ||
                      animationData.duration ||
                      600,
                    properties: {
                      ...actualProperties,
                      absoluteStart: startTime,
                      absoluteEnd:
                        startTime +
                        (actualProperties.duration ||
                          animationData.duration ||
                          600),
                    },
                    effectVariant: animationData.effectVariant,
                    row: targetRow,
                  };
                  console.log(
                    'TimelineRow: Created newAnimation',
                    newAnimation
                  );


                  console.log(
                    'TimelineRow: Adding animation to store',
                    newAnimation
                  );
                  if (store) {
                    store.addAnimation(newAnimation);
                    console.log('TimelineRow: Animation added successfully');


                    console.log(
                      'TimelineRow: Validating animation targets for row',
                      targetRow
                    );
                    console.log(
                      'TimelineRow: Elements in target row before validation:',
                      store.editorElements.filter(el => el.row === targetRow)
                    );
                    store.validateAndUpdateAnimationTargets(
                      newAnimation.id,
                      targetRow
                    );
                    console.log('TimelineRow: Animation targets validated');
                    console.log(
                      'TimelineRow: Updated animation:',
                      store.animations.find(a => a.id === newAnimation.id)
                    );

                    store.scheduleAnimationRefresh();


                    if (
                      window.dispatchSaveTimelineState &&
                      !store.isUndoRedoOperation
                    ) {
                      window.dispatchSaveTimelineState(store);
                    }
                  } else {
                    console.error('TimelineRow: Store is not available');
                  }
                }
              );
            }
            return;
          }


          console.log('TimelineRow: Using fallback logic (no ghost)');
          const animationData = item.animation;

          const actualType = animationData.unifiedType || animationData.type;
          const actualProperties =
            animationData.unifiedProperties || animationData.properties || {};

          const newAnimation = {
            id: getUid(),
            type: actualType,
            duration:
              actualProperties.duration || animationData.duration || 600,
            properties: {
              ...actualProperties,
              absoluteStart: 0,
              absoluteEnd:
                actualProperties.duration || animationData.duration || 600,
            },
            effectVariant: animationData.effectVariant,
            row: rowIndex,
          };

          console.log(
            'TimelineRow: Fallback - created animation',
            newAnimation
          );
          store.addAnimation(newAnimation);
          console.log('TimelineRow: Fallback - animation added');


          console.log(
            'TimelineRow: Fallback - validating animation targets for row',
            rowIndex
          );
          store.validateAndUpdateAnimationTargets(newAnimation.id, rowIndex);
          console.log('TimelineRow: Fallback - animation targets validated');

          store.scheduleAnimationRefresh();

          if (window.dispatchSaveTimelineState && !store.isUndoRedoOperation) {
            window.dispatchSaveTimelineState(store);
          }
          return;
        }

        if (item.type === 'gl-transition-drop') {
          console.log(
            'TimelineRow: gl-transition-drop detected in drop handler',
            item
          );


          if (store.ghostState.isDragging && store.ghostState.isAnimationDrag) {
            console.log(
              'TimelineRow: Skipping gl-transition-drop - this is an existing animation being moved'
            );
            return;
          }


          if (
            store.ghostState.isGalleryDragging &&
            store.ghostState.galleryGhostElement
          ) {
            console.log(
              'TimelineRow: Using gallery ghost for gl-transition-drop'
            );
            const hoverBoundingRect = dropRef.current?.getBoundingClientRect();
            const clientOffset = monitor.getClientOffset();

            if (hoverBoundingRect && clientOffset) {
              const mouseX = clientOffset.x - hoverBoundingRect.left;
              const finalPosition =
                (mouseX / hoverBoundingRect.width) * store.maxTime;

              store.finishGalleryGhostDrag(
                finalPosition,
                rowIndex,
                async (startTime, targetRow) => {
                  console.log(
                    'TimelineRow: GL transition finishGalleryGhostDrag callback',
                    { startTime, targetRow }
                  );
                  const glTransitionData = item.glTransition;
                  console.log(
                    'TimelineRow: glTransitionData',
                    glTransitionData
                  );


                  const newGLTransition = {
                    id: getUid(),
                    type: 'glTransition',
                    transitionType: glTransitionData.transitionType,
                    duration: glTransitionData.duration,
                    startTime: startTime,
                    endTime: startTime + glTransitionData.duration,
                    row: targetRow,
                    properties: {
                      absoluteStart: startTime,
                      absoluteEnd: startTime + glTransitionData.duration,
                      duration: glTransitionData.duration,
                    },
                  };

                  console.log(
                    'TimelineRow: Created GL transition',
                    newGLTransition
                  );


                  if (store) {

                    newGLTransition.fromElementId = null
                    newGLTransition.toElementId = null
                    newGLTransition.targetIds = []
                    newGLTransition.manuallyAdjusted = false;
                    newGLTransition.properties.transitionType =
                      glTransitionData.transitionType;

                    store.animations.push(newGLTransition);


                    const timelineElement = {
                      id: getUid(),
                      type: 'animation',
                      animationId: newGLTransition.id,
                      row: targetRow,
                      timeFrame: {
                        start: startTime,
                        end: startTime + glTransitionData.duration,
                      },
                      isGLTransition: true,
                      effectDirection: 'transition',
                      properties: {
                        displayName:
                          glTransitionData.name ||
                          glTransitionData.transitionType,
                      },
                    };

                    store.editorElements.push(timelineElement);
                    console.log('TimelineRow: GL transition added to timeline');


                    store.validateAndUpdateAnimationTargets(
                      newGLTransition.id,
                      targetRow
                    );
                    console.log('TimelineRow: GL transition targets validated');

                    store.scheduleAnimationRefresh();
                  }


                  if (
                    window.dispatchSaveTimelineState &&
                    !store.isUndoRedoOperation
                  ) {
                    window.dispatchSaveTimelineState(store);
                  }
                }
              );
            }
          }

          return;
        }


        if (!monitor.getItem()) return;
      },
      canDrop: item => {
        if (item.type === 'gallery-image' || item.type === 'scene-image') {
          const canDropImage =
            !overlays.length ||
            areTypesCompatible(overlays[0]?.type, 'imageUrl');
          return canDropImage;
        }

        if (item.type === 'gallery-video' || item.type === 'scene-video') {
          const canDropVideo =
            !overlays.length || areTypesCompatible(overlays[0]?.type, 'video');
          return canDropVideo;
        }

        if (item.type === 'animation-effect') {
          const canDropAnimation =
            !overlays.length ||
            areTypesCompatible(overlays[0]?.type, 'video') ||
            areTypesCompatible(overlays[0]?.type, 'imageUrl');
          return canDropAnimation;
        }

        if (item.type === 'animation-drop') {

          const canDropAnimation =
            !overlays.length ||
            areTypesCompatible(overlays[0]?.type, 'imageUrl') ||
            areTypesCompatible(overlays[0]?.type, 'video') ||
            areTypesCompatible(overlays[0]?.type, 'audio');
          return canDropAnimation;
        }

        if (item.type === 'gl-transition-drop') {

          const canDropGLTransition =
            !overlays.length ||
            areTypesCompatible(overlays[0]?.type, 'imageUrl') ||
            areTypesCompatible(overlays[0]?.type, 'video') ||
            areTypesCompatible(overlays[0]?.type, 'audio');
          return canDropGLTransition;
        }
        const draggedElement = store.editorElements.find(
          el => el.id === item.id
        );
        const rowType = overlays[0]?.type;

        if (!draggedElement) return false;

        const canDropResult =
          overlays.some(el => el.id === item.id) ||
          !rowType ||
          areTypesCompatible(rowType, draggedElement.type);

        return canDropResult;
      },
      collect: monitor => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    });


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

    const handleFileDropWithPosition = async (file, startTime, targetRow) => {
      try {
        if (file.type.startsWith('audio/')) {

          const audio = new Audio();
          const audioDuration = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Timeout loading audio metadata'));
            }, 10000);
            
            audio.addEventListener('loadedmetadata', () => {
              clearTimeout(timeout);
              resolve(audio.duration * 1000);
            });
            audio.addEventListener('error', () => {
              clearTimeout(timeout);
              reject(new Error('Failed to load audio metadata'));
            });
            audio.src = URL.createObjectURL(file);
          });

          store.addExistingAudio({
            base64Audio: URL.createObjectURL(file),
            durationMs: audioDuration,
            row: targetRow,
            startTime: startTime,
            audioType: 'music',
            duration: audioDuration,
            id: Date.now() + Math.random().toString(36).substring(2, 9),
          });
          toast.success(`Added ${file.name} to timeline`);
        } else if (file.type.startsWith('image/')) {
          let imageUrl = null;
          let minUrl = null;
          
          try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await uploadImage(formData);

            if (response) {
              imageUrl = response.data.url;
              minUrl = response.data.minUrl;
            }
          } catch (error) {
            const isAuthError = error?.response?.status === 401;
            handleCatchError(error, 'Failed to upload image');
            

            imageUrl = URL.createObjectURL(file);
            minUrl = imageUrl;
            
            if (isAuthError) {
              toast(`Using local file for ${file.name} (upload unavailable)`, { icon: '⚠️' });
            } else {
              toast(`Using local file for ${file.name} (upload failed)`, { icon: '⚠️' });
            }
          }

          if (imageUrl) {
            await store.addImageLocal({
              url: imageUrl,
              minUrl: minUrl,
              row: targetRow,
              startTime: startTime,
            });
            toast.success(`Added ${file.name} to timeline`);
          }
        } else if (file.type.startsWith('video/')) {
          try {

            await store.handleVideoUpload(file);


            const videoUrl = URL.createObjectURL(file);
            const duration = await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Timeout loading video metadata'));
              }, 15000);
              
              const video = document.createElement('video');
              video.preload = 'metadata';
              video.addEventListener('loadedmetadata', () => {
                clearTimeout(timeout);
                resolve(video.duration * 1000);
              });
              video.addEventListener('error', () => {
                clearTimeout(timeout);
                reject(new Error('Failed to load video metadata'));
              });
              video.src = videoUrl;
            });


            const hasAudio = await checkVideoHasAudio(videoUrl);


            let url = videoUrl
            let key = null;
            
            try {
              const uploadResult = await uploadVideoToAWS(file, progress => {

              });
              url = uploadResult.url;
              key = uploadResult.key;


              if (key && url) {
                const videoData = {
                  key: key,
                  s3Url: url,
                  title: file.name,
                  length: duration / 1000
                };

                try {
                  await saveVideoData(
                    videoData,
                    store.currentStoryId,
                    user
                  );
                } catch (saveError) {
                  console.warn('Failed to save video metadata, continuing with local file:', saveError);
                }
              }
            } catch (uploadError) {
              const isAuthError = uploadError?.response?.status === 401;
              console.warn('Video upload failed, using local file:', uploadError);
              

              url = videoUrl;
              key = null;
              
              if (isAuthError) {
                toast(`Using local file for ${file.name} (upload unavailable)`, { icon: '⚠️' });
              } else {
                toast(`Using local file for ${file.name} (upload failed)`, { icon: '⚠️' });
              }
            }


            await store.handleVideoUploadFromUrl({
              url: url,
              title: file.name,
              key: key,
              duration: duration,
              row: targetRow,
              startTime: startTime,
              isNeedLoader: false,
            });


            if (hasAudio) {

              let audioRow = null;
              for (let row = 0; row < store.maxRows; row++) {
                const rowElements = store.getElementsInRow(row);
                const hasAudio = rowElements.some(
                  el => el.type === 'audio' || el.type === 'sound'
                );
                if (hasAudio) {
                  audioRow = row;
                  break;
                }
              }
              
              if (audioRow === null) {
                audioRow = store.maxRows;
                store.shiftRowsDown(audioRow);
              }

              store.addExistingAudio({
                base64Audio: url,
                durationMs: duration,
                row: audioRow,
                startTime: startTime, 
                audioType: 'music',
                duration: duration,
                id: `audio-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                linkedVideoId: store.editorElements.find(el => 
                  el.type === 'video' && 
                  el.properties?.src === url &&
                  el.timeFrame.start === startTime
                )?.id,
              });
            }

            toast.success(`Added ${file.name} to timeline${hasAudio ? ' with audio track' : ''}`);
          } catch (error) {
            handleCatchError(error, 'Failed to upload video');
            toast.error(`Failed to upload ${file.name}: ${error.message || 'Unknown error'}`);
          }
        } else {
          toast.error(`Unsupported file type: ${file.name}. Please use image, video, or audio files.`);
        }
      } catch (error) {
        console.error('Error handling file drop:', error);
        toast.error(`Failed to process ${file.name}: ${error.message || 'Unknown error'}`);
      }
    };

    const onFileDrop = async e => {
      e.preventDefault();
      setIsDraggingFile(false);
      if (isDraggingTimelineElement) {
        return;
      }

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (
          store.ghostState.isFileDragging &&
          store.ghostState.fileGhostElement
        ) {
          const rect = dropRef.current?.getBoundingClientRect();
          if (rect) {
            const mouseX = e.clientX - rect.left;
            const finalPosition = (mouseX / rect.width) * store.maxTime;

            store.finishFileGhostDrag(
              finalPosition,
              rowIndex,
              async (startTime, targetRow) => {
                await handleFileDropWithPosition(file, startTime, targetRow);
              }
            );
            return;
          }
        }

        if (
          file.type.startsWith('audio/') &&
          (!overlays.length || areTypesCompatible(overlays[0]?.type, 'audio'))
        ) {
        } else if (file.type.startsWith('image/')) {
          try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await uploadImage(formData);

            if (response) {
              if (
                !overlays.length ||
                areTypesCompatible(overlays[0]?.type, 'imageUrl')
              ) {
                const rowElements = store.editorElements.filter(
                  el => el.row === rowIndex
                );


                let startTime = 0;
                let hasSpace = true;

                if (rowElements.length > 0) {

                  const sortedElements = [...rowElements].sort(
                    (a, b) => a.timeFrame.start - b.timeFrame.start
                  );

                  hasSpace = false


                  for (let i = 0; i <= sortedElements.length; i++) {
                    const currentStart =
                      i === 0 ? 0 : sortedElements[i - 1].timeFrame.end;
                    const nextStart =
                      i === sortedElements.length
                        ? store.maxTime
                        : sortedElements[i].timeFrame.start;

                    if (nextStart - currentStart >= 5000) {
                      startTime = currentStart;
                      hasSpace = true;
                      break;
                    }
                  }
                }

                if (hasSpace) {
                  await store.addImageLocal({
                    url: response.data.url,
                    minUrl: response.data.minUrl,
                    row: rowIndex,
                    startTime: startTime,
                  });
                } else {
                  store.shiftRowsDown(rowIndex + 1);
                  await store.addImageLocal({
                    url: response.data.url,
                    minUrl: response.data.minUrl,
                    row: rowIndex + 1,
                    startTime: 0,
                  });
                }
              } else {
                await store.addImageLocal({
                  url: response.data.url,
                  minUrl: response.data.minUrl,
                  row: store.maxRows,
                  startTime: 0,
                });
              }
            }
          } catch (error) {
            handleCatchError(error, 'Failed to upload image');
          }
        } else if (file.type.startsWith('video/')) {
        }
      }
    };

    useEffect(() => {
      const dropTarget = dropRef.current;
      if (!dropTarget) return;

      const handleDragEnter = e => {
        e.preventDefault();
        if (isDraggingTimelineElement) {
          return;
        }
        if (
          e.dataTransfer?.types.includes('application/json') ||
          e.dataTransfer?.types.some(type =>
            type.startsWith('__REACT_DND_NATIVE_TYPE__')
          )
        ) {
          return;
        }

        if (e.dataTransfer?.types.includes('Files')) {
          const fileType = e.dataTransfer.items?.[0]?.type;
          if (
            (fileType.startsWith('audio/') &&
              (!overlays.length ||
                areTypesCompatible(overlays[0]?.type, 'audio'))) ||
            (fileType.startsWith('image/') &&
              (!overlays.length ||
                areTypesCompatible(overlays[0]?.type, 'imageUrl'))) ||
            (fileType.startsWith('video/') &&
              (!overlays.length ||
                areTypesCompatible(overlays[0]?.type, 'video')))
          ) {
            setIsDraggingFile(true);

            if (!store.ghostState.isFileDragging) {
              const file = e.dataTransfer.items?.[0];
              let elementType = 'imageUrl';
              let defaultDuration = 5000;

              if (fileType.startsWith('audio/')) {
                elementType = 'audio';
                defaultDuration = 30000; 
              } else if (fileType.startsWith('video/')) {
                elementType = 'video';
                defaultDuration = 10000; 
              }

              store.startFileGhostDrag(file, elementType, defaultDuration);
            }
          }
        }
      };

      const handleDragOver = e => {
        e.preventDefault();
        if (
          store.ghostState.isFileDragging &&
          e.dataTransfer?.types.includes('Files')
        ) {
          const rect = dropRef.current?.getBoundingClientRect();
          if (rect) {
            const mouseX = e.clientX - rect.left;
            const newPosition = (mouseX / rect.width) * store.maxTime;
            const rowType = overlays[0]?.type;
            const fileType = e.dataTransfer.items?.[0]?.type;

            let targetElementType = 'imageUrl';
            if (fileType?.startsWith('audio/')) {
              targetElementType = 'audio';
            } else if (fileType?.startsWith('video/')) {
              targetElementType = 'video';
            }

            const isIncompatible =
              rowType && !areTypesCompatible(rowType, targetElementType);
            store.updateFileGhost(newPosition, rowIndex, isIncompatible);
          }
        }
      };

      const handleDragLeave = e => {
        e.preventDefault();
        setIsDraggingFile(false);
      };

      const handleDrop = e => {
        if (
          e.dataTransfer?.types.includes('application/json') ||
          e.dataTransfer?.types.some(type =>
            type.startsWith('__REACT_DND_NATIVE_TYPE__')
          )
        ) {
          return;
        }

        setIsDraggingFile(false);
        onFileDrop(e);
      };

      dropTarget.addEventListener('dragenter', handleDragEnter);
      dropTarget.addEventListener('dragover', handleDragOver);
      dropTarget.addEventListener('dragleave', handleDragLeave);
      dropTarget.addEventListener('drop', handleDrop);

      return () => {
        dropTarget.removeEventListener('dragenter', handleDragEnter);
        dropTarget.removeEventListener('dragover', handleDragOver);
        dropTarget.removeEventListener('dragleave', handleDragLeave);
        dropTarget.removeEventListener('drop', handleDrop);
      };
    }, [overlays, onFileDrop]);

    useEffect(() => {
      const handleDragEnd = () => {
        setIsDraggingFile(false);
        setIsDraggingFileOverDropZone(false);
        setIsDraggingFileOverTopDropZone(false);
      };

      document.addEventListener('drop', handleDragEnd);

      return () => {
        document.removeEventListener('drop', handleDragEnd);
      };
    }, []);

    const renderRowDragHandle = useCallback(() => {
      const hasElements = overlays.length > 0;

      return (
        <div
          className={`${styles.rowDragHandle} ${
            store.ghostState.dragOverRowIndex === rowIndex
              ? styles.dragOver
              : ''
          } ${
            store.ghostState.draggedRowIndex === rowIndex ? styles.dragging : ''
          }`}
          data-row-drag-handle
          onMouseDown={e => {
            if (!hasElements) return;

            e.preventDefault();
            e.stopPropagation();

            store.startRowDrag(rowIndex);

            const handleMouseMove = moveEvent => {
              const allRowWrappers = Array.from(
                document.querySelectorAll('[data-row-index]')
              );
              if (!allRowWrappers.length) return;

              const originWrapper = allRowWrappers[rowIndex];
              if (!originWrapper) return;
              const originRect = originWrapper.getBoundingClientRect();

              const hoveredWrapper = document
                .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
                ?.closest('[data-row-index]');

              if (!hoveredWrapper) {
                store.updateRowDragOver(null);
                return;
              }

              const candidateIndex = parseInt(
                hoveredWrapper.getAttribute('data-row-index'),
                10
              );
              if (Number.isNaN(candidateIndex)) {
                store.updateRowDragOver(null);
                return;
              }

              if (candidateIndex === rowIndex) {
                store.updateRowDragOver(null);
                return;
              }

              const candidateRect = hoveredWrapper.getBoundingClientRect();
              let targetRowIndex = rowIndex;
              let insertPosition = null; 
              if (candidateIndex > rowIndex) {
                const boundary = (originRect.bottom + candidateRect.top) / 2;
                if (moveEvent.clientY >= boundary) {
                  targetRowIndex = candidateIndex;
                  insertPosition = 'below';
                }
              } else {
                const boundary = (candidateRect.bottom + originRect.top) / 2;
                if (moveEvent.clientY <= boundary) {
                  targetRowIndex = candidateIndex;
                  insertPosition = 'above';
                }
              }

              if (targetRowIndex !== rowIndex) {
                store.updateRowDragOver(targetRowIndex, insertPosition);
              } else {
                store.updateRowDragOver(null, null);
              }
            };

            const handleMouseUp = upEvent => {
              const allRowWrappers = Array.from(
                document.querySelectorAll('[data-row-index]')
              );
              let targetRowIndex = rowIndex;
              if (allRowWrappers.length) {
                const originWrapper = allRowWrappers[rowIndex];
                if (originWrapper) {
                  const originRect = originWrapper.getBoundingClientRect();
                  const hoveredWrapper = document
                    .elementFromPoint(upEvent.clientX, upEvent.clientY)
                    ?.closest('[data-row-index]');
                  if (hoveredWrapper) {
                    const candidateIndex = parseInt(
                      hoveredWrapper.getAttribute('data-row-index'),
                      10
                    );
                    if (!Number.isNaN(candidateIndex)) {
                      if (candidateIndex === rowIndex) {
                        targetRowIndex = rowIndex;
                      } else {
                        const candidateRect =
                          hoveredWrapper.getBoundingClientRect();
                        if (candidateIndex > rowIndex) {
                          const boundary =
                            (originRect.bottom + candidateRect.top) / 2;
                          targetRowIndex =
                            upEvent.clientY >= boundary
                              ? candidateIndex
                              : rowIndex;
                        } else {
                          const boundary =
                            (candidateRect.bottom + originRect.top) / 2;
                          targetRowIndex =
                            upEvent.clientY <= boundary
                              ? candidateIndex
                              : rowIndex;
                        }
                      }
                    }
                  }
                }
              }

              if (targetRowIndex !== rowIndex) {
                store.finishRowDrag(targetRowIndex);
              } else {
                store.cancelRowDrag();
              }

              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
          onClick={e => {
            e.stopPropagation();
          }}
          style={{
            opacity: hasElements ? 1 : 0.3,
            cursor: hasElements
              ? store.ghostState.draggedRowIndex === rowIndex
                ? 'grabbing'
                : 'grab'
              : 'default',
          }}
        >
          {hasElements && <GripIcon size={14} color="#ffffff66" />}
        </div>
      );
    }, [overlays.length, rowIndex, store]);

    return (
      <div style={{ position: 'relative' }} data-testid="timeline-row">
        {false && rowIndex === 0 && (
          <div
            ref={node => {
            }}
            className={styles.dropZone}
            style={{
              position: 'absolute',
              top: '-4px',
              left: 0,
              right: 0,
              height: '12px',
              cursor: 'pointer',
            }}
            onDragEnter={e => {
              e.preventDefault();
              if (isDraggingTimelineElement) {
                return;
              }

              if (
                e.dataTransfer?.types.includes('application/json') ||
                e.dataTransfer?.types.some(type =>
                  type.startsWith('__REACT_DND_NATIVE_TYPE__')
                )
              ) {
                return;
              }

              if (e.dataTransfer?.types.includes('Files')) {
                const fileType = e.dataTransfer.items?.[0]?.type;
                if (
                  fileType.startsWith('audio/') ||
                  fileType.startsWith('image/') ||
                  fileType.startsWith('video/')
                ) {
                  setIsDraggingFileOverTopDropZone(true);
                }
              }
            }}
            onDragLeave={e => {
              e.preventDefault();
              setIsDraggingFileOverTopDropZone(false);
            }}
            onDragOver={e => {
              e.preventDefault();
            }}
            onDrop={async e => {
              e.preventDefault();
              setIsDraggingFileOverTopDropZone(false);
              if (isDraggingTimelineElement) {
                return;
              }
              if (
                e.dataTransfer?.types.includes('application/json') ||
                e.dataTransfer?.types.some(type =>
                  type.startsWith('__REACT_DND_NATIVE_TYPE__')
                )
              ) {
                return;
              }

              const files = e.dataTransfer.files;
              if (files && files.length > 0) {
                const file = files[0];

                if (file.type.startsWith('audio/')) {
                } else if (file.type.startsWith('image/')) {
                  try {
                    const formData = new FormData();
                    formData.append('image', file);

                    const response = await uploadImage(formData);

                    if (response) {
                      store.shiftRowsDown(0);
                      await store.addImageLocal({
                        url: response.data.url,
                        minUrl: response.data.minUrl,
                        row: 0,
                        startTime: 0,
                      });
                    }
                  } catch (error) {
                    handleCatchError(error, 'Failed to upload image');
                  }
                } else if (file.type.startsWith('video/')) {
                  try {
                    await store.handleVideoUpload(file);

                    const duration = await new Promise(resolve => {
                      const video = document.createElement('video');
                      video.preload = 'metadata';
                      video.onloadedmetadata = () => {
                        resolve(video.duration * 1000)
                      };
                      video.src = URL.createObjectURL(file);
                    });

                    const { url, key } = await uploadVideoToAWS(
                      file,
                      progress => {
                        
                      }
                    );

                  
                    const videoData = {
                      key: key,
                      s3Url: url,
                      title: file.name,
                      length: duration / 1000, 
                    };

                    const saved = await saveVideoData(
                      videoData,
                      store.currentStoryId,
                      user
                    );

                    store.handleVideoUploadFromUrl({
                      url: url,
                      title: file.name,
                      key: key,
                      duration: duration,
                      row: 0,
                      startTime: 0,
                      isNeedLoader: false,
                    });
                  } catch (error) {
                    handleCatchError(error, 'Failed to upload video');
                  }
                }
              }
            }}
          >
            {!store.selectedElements && (
              <div
                className={styles.dropIndicator}
                style={{
                  position: 'absolute',
                  top: '4px',
                  left: 0,
                  right: 0,
                  height: '4px',
                  background: '',
                  zIndex: 1000,
                  borderRadius: '2px',
                  transition: 'all 0.2s ease',
                  opacity: 0,
                  boxShadow: 'none',
                }}
              />
            )}
          </div>
        )}

        <Resizable
          height={rowHeight}
          width={0}
          axis="y"
          minConstraints={[0, 20]}
          maxConstraints={[0, 200]}
          onResize={handleRowResize}
          resizeHandles={['s']}
        >
          <div
            ref={node => {
              drop(node);
              dropRef.current = node;
            }}
            className={`${styles.timelineRow} ${
              (isOver && canDrop) ||
              (isDraggingFile &&
                (!rowType || areTypesCompatible(rowType, overlays[0]?.type)))
                ? styles.rowHover
                : ''
            }`}
            data-testid="timeline-row"
            data-timeline-row={rowId}
            style={{
              height: `${rowHeight}px`,
              minHeight: `${rowHeight}px`,
              border: !rowType && '1px solid #ffffff05',
              padding: rowType === 'transition' ? '2px 0' : '0',
              position: 'relative',
            }}
          >

            {store.ghostState.isDraggingRow &&
              store.ghostState.dragOverRowIndex === rowIndex && (
                <>
                  <div/>
                  {store.ghostState.rowInsertPosition === 'above' && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: '-2px',
                        height: '2px',
                        background: 'var(--accent-color)',
                        borderRadius: '2px',
                        pointerEvents: 'none',
                        zIndex: 55,
                      }}
                    />
                  )}
                  {store.ghostState.rowInsertPosition === 'below' && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: '-2px',
                        height: '2px',
                        background: 'var(--accent-color)',
                        borderRadius: '2px',
                        pointerEvents: 'none',
                        zIndex: 55,
                      }}
                    />
                  )}
                </>
              )}
            <div
              className={styles.rowType}
              style={{
                height: `${rowHeight}px`,
                minHeight: `${rowHeight}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {renderRowDragHandle()}
            </div>
            <div
              className={styles.overlaysContainer}
              data-testid="overlays-container"
              style={{ position: 'relative' }}
            >
              {overlays.map(overlay => {
                if (overlay.type === 'animation') {
                  return (
                    <AnimationItem
                      key={overlay.id}
                      item={overlay}
                      rowHeight={rowHeight}
                    />
                  );
                }

                return (
                  <TimelineItem
                    key={overlay.id}
                    item={overlay}
                    toggleAnimations={toggleAnimations}
                    handleActiveScene={handleActiveScene}
                    storyData={storyData}
                    isCutMode={isCutMode}
                    defaultButton={defaultButton}
                    setIsCutMode={data => setIsCutMode(data)}
                    scenes={scenes}
                    rowHeight={rowHeight}
                  />
                );
              })}

              {!store.ghostState.isDragging &&
                (overlays.length === 0 ? (
                  <div
                    className={`${styles.gapIndicator} ${styles.gapIndicatorGroup}`}
                    style={{
                      left: '0%',
                      width: '100%',
                      opacity: 1,
                      zIndex: 20,
                      pointerEvents: 'auto',
                    }}
                    onClick={e => {
                      e.stopPropagation();
                      if (store.deleteRow) {
                        store.deleteRow(rowIndex);
                      }
                    }}
                  >
                    <div className={styles.gapPattern} />
                    <div className={styles.gapCloseButton}>
                      <div className={styles.gapCloseIcon}>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M18 6L6 18M6 6L18 18"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                ) : (
                  store.getRowGaps(rowIndex).map((gap, gapIndex) => {
                    const elementsInRow = overlays.length;
                    const gapKey = `gap-${rowIndex}-${gap.start}-${gap.end}-${elementsInRow}`;

                    return (
                      <GapIndicator
                        key={gapKey}
                        gap={gap}
                        rowIndex={rowIndex}
                        totalDuration={store.maxTime}
                      />
                    );
                  })
                ))}

              {overlays.length > 0 &&
                (overlays[0]?.type === 'imageUrl' ||
                  overlays[0]?.type === 'video') && (
                  <TransitionVisualizer
                    rowIndex={rowIndex}
                    onOpenTransitionPanel={onOpenTransitionPanel}
                  />
                )}
              {!overlays.some(overlay => overlay.type === 'animation') &&
                !store.animations.some(anim =>
                  overlays.some(overlay => overlay.id === anim.targetId)
                ) && (
                  <EffectVisualizer
                    rowIndex={rowIndex}
                    onOpenEffectPanel={onOpenEffectPanel}
                  />
                )}
            </div>
          </div>
        </Resizable>
        <div
          ref={node => {
          }}
          className={styles.dropZone}
          style={{
            display: 'none', 
            position: 'absolute',
            bottom: '-12px',
            left: 0,
            right: 0,
            height: '12px',
            cursor: 'pointer',
          }}
          onDragEnter={e => {
            e.preventDefault();
            if (isDraggingTimelineElement) {
              return;
            }

            if (
              e.dataTransfer?.types.includes('application/json') ||
              e.dataTransfer?.types.some(type =>
                type.startsWith('__REACT_DND_NATIVE_TYPE__')
              )
            ) {
              return;
            }

            if (e.dataTransfer?.types.includes('Files')) {
              const fileType = e.dataTransfer.items?.[0]?.type;
              if (
                fileType.startsWith('audio/') ||
                fileType.startsWith('image/') ||
                fileType.startsWith('video/')
              ) {
                setIsDraggingFileOverDropZone(true);
              }
            }
          }}
          onDragLeave={e => {
            e.preventDefault();
            setIsDraggingFileOverDropZone(false);
          }}
          onDragOver={e => {
            e.preventDefault();
          }}
          onDrop={async e => {
            e.preventDefault();
            setIsDraggingFileOverDropZone(false);

            if (isDraggingTimelineElement) {
              return;
            }

            if (
              e.dataTransfer?.types.includes('application/json') ||
              e.dataTransfer?.types.some(type =>
                type.startsWith('__REACT_DND_NATIVE_TYPE__')
              )
            ) {
              return;
            }

            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
              const file = files[0];

              if (file.type.startsWith('audio/')) {
              } else if (file.type.startsWith('image/')) {
                try {
                  const formData = new FormData();
                  formData.append('image', file);

                  const response = await uploadImage(formData);

                  if (response) {
                    store.shiftRowsDown(rowIndex + 1);
                    await store.addImageLocal({
                      url: response.data.url,
                      minUrl: response.data.minUrl,
                      row: rowIndex + 1,
                      startTime: 0,
                    });
                  }
                } catch (error) {
                  handleCatchError(error, 'Failed to upload image');
                }
              } else if (file.type.startsWith('video/')) {
                try {
                  await store.handleVideoUpload(file);

                  const duration = await new Promise(resolve => {
                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    video.onloadedmetadata = () => {
                      resolve(video.duration * 1000); 
                    };
                    video.src = URL.createObjectURL(file);
                  });

                  const { url, key } = await uploadVideoToAWS(
                    file,
                    progress => {
                  
                    }
                  );

                  const videoData = {
                    key: key,
                    s3Url: url,
                    title: file.name,
                    length: duration / 1000, 
                  };

                  const saved = await saveVideoData(
                    videoData,
                    store.currentStoryId,
                    user
                  );

                  store.handleVideoUploadFromUrl({
                    url: url,
                    title: file.name,
                    key: key,
                    duration: duration,
                    row: rowIndex + 1,
                    startTime: 0,
                    isNeedLoader: false,
                  });
                } catch (error) {
                  handleCatchError(error, 'Failed to upload video');
                }
              }
            }
          }}
        >
          {!store.selectedElements && (
            <div
              className={styles.dropIndicator}
              style={{
                position: 'absolute',
                top: '4px',
                left: 0,
                right: 0,
                height: '4px',
                background: '',
                zIndex: 1000,
                borderRadius: '2px',
                transition: 'all 0.2s ease',
                opacity: 0,
                boxShadow: 'none',
              }}
            />
          )}
        </div>
      </div>
    );
  }
);

export default TimelineRow;
