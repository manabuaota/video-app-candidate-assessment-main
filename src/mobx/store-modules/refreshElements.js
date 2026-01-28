import { fabric } from 'fabric';
import { isHtmlVideoElement, isHtmlImageElement } from '../../utils';

export const refreshElementsUtil = async store => {
        if (!store.canvas) return;
    

        if (store.isRefreshingElements) {
          return;
        }
        store.isRefreshingElements = true;
    
        try {

        store.canvas.off('object:modified');
        store.canvas.off('object:added');
    

        store.canvas.clear();
    

        fabric.Text.prototype.set({
          _getNonTransformedDimensions() {
            return new fabric.Point(this.width, this.height).scalarAdd(
              this.padding * 2
            );
          },
          _calculateCurrentDimensions() {
            return fabric.util.transformPoint(
              this._getTransformedDimensions(),
              this.getViewportTransform(),
              true
            );
          },
        });
    

        const sortedElements = [...store.editorElements].sort((a, b) => {
          if (a.type === 'text' && b.type !== 'text') return 1;
          if (b.type === 'text' && a.type !== 'text') return -1;
          return b.row - a.row;
        });
    
        const imagePromises = [];
        let batchUpdateTimeout;
    

        store.canvas.on('object:modified', e => {
          if (!e.target) return;
          const element = store.editorElements.find(
            el => el.fabricObject === e.target
          );
          if (element && typeof store.handleObjectModified === 'function') {
            store.handleObjectModified(e.target, element);
          }

          if (e.target) {
            store.canvas.setActiveObject(e.target);
            store.canvas.requestRenderAll();
          }
        });
    

        store.updateCanvasFrameFill();
    

        for (let index = 0; index < sortedElements.length; index++) {
          const element = sortedElements[index];
    
          if (!element) continue;
    
          switch (element.type) {
            case 'video':
              if (!document.getElementById(element.properties.elementId)) {
                continue;
              }
              const videoElement = document.getElementById(
                element.properties.elementId
              );
              if (!isHtmlVideoElement(videoElement)) {
                continue;
              }
              const videoObject = new fabric.CoverVideo(videoElement, {
                name: element.id,
                left: element.placement.x,
                top: element.placement.y,
                width: element.placement.width,
                height: element.placement.height,
                scaleX: element.placement.scaleX,
                scaleY: element.placement.scaleY,
                angle: element.placement.rotation,
                objectCaching: true,
                selectable: true,
                lockUniScaling: false,
                hasControls: true,
                hasBorders: true,
                customFilter: element.properties.effect.type,
              });
    
              element.fabricObject = videoObject;
              element.properties.imageObject = videoObject;
              videoElement.width = 100;
              videoElement.height =
                (videoElement.videoHeight * 100) / videoElement.videoWidth;
              store.canvas.add(videoObject);
              break;
    
            case 'image':
            case 'imageUrl':

              if (element.properties.hideInCanvas) {
                break;
              }
    
              if (element.fabricObject) {

                const originalWidth = element.fabricObject.width || element.placement.width;
                const originalHeight = element.fabricObject.height || element.placement.height;
                
                element.fabricObject.set({
                  left: element.placement.x,
                  top: element.placement.y,
                  angle: element.placement.rotation,
                  scaleX: element.placement.scaleX,
                  scaleY: element.placement.scaleY,
                  objectCaching: true,
    
                  cropX:
                    element.placement.cropX !== undefined
                      ? element.placement.cropX
                      : element.fabricObject.cropX,
                  cropY:
                    element.placement.cropY !== undefined
                      ? element.placement.cropY
                      : element.fabricObject.cropY,

                  width: originalWidth,
                  height: originalHeight,
                });
                store.canvas.add(element.fabricObject);
              } else if (element.type === 'image') {
                const imageElement = document.getElementById(
                  element.properties.elementId
                );
                if (!imageElement || !isHtmlImageElement(imageElement)) continue;
    
                const imageObject = new fabric.CoverImage(imageElement, {
                  name: element.id,
                  left: element.placement.x,
                  top: element.placement.y,
                  angle: element.placement.rotation,
                  objectCaching: true,
                  selectable: true,
                  lockUniScaling: true,
                  customFilter: element.properties.effect.type,
                });
    
                element.fabricObject = imageObject;
                element.properties.imageObject = imageObject;
    
                const image = {
                  w: imageElement.naturalWidth,
                  h: imageElement.naturalHeight,
                };
    
                imageObject.width = image.w;
                imageObject.height = image.h;
                imageElement.width = image.w;
                imageElement.height = image.h;
    
                const toScale = {
                  x: element.placement.width / image.w,
                  y: element.placement.height / image.h,
                };
    
                imageObject.scaleX = toScale.x * element.placement.scaleX;
                imageObject.scaleY = toScale.y * element.placement.scaleY;
    
                store.canvas.add(imageObject);
              } else if (element.type === 'imageUrl' && element.properties.src) {

    
                const imagePromise = new Promise((resolve, reject) => {

                  const cacheBustUrl =
                    element.properties.src +
                    (element.properties.src.includes('?') ? '&' : '?') +
                    '_cb=' +
                    Date.now();
                  fabric.Image.fromURL(
                    cacheBustUrl,
                    imageObjectDefault => {
                      imageObjectDefault.set({
                        name: element.id,
                        left: element.placement.x,
                        top: element.placement.y,
                        angle: element.placement.rotation,
                        scaleX: element.placement.scaleX,
                        scaleY: element.placement.scaleY,
                        selectable: true,
                        lockUniScaling: true,
                        objectCaching: true,
                        cropX:
                          element.placement.cropX !== undefined
                            ? element.placement.cropX
                            : 0,
                        cropY:
                          element.placement.cropY !== undefined
                            ? element.placement.cropY
                            : 0,
                        width: element.placement.width / element.placement.scaleX,
                        height: element.placement.height / element.placement.scaleY,
                      });
    
                      element.fabricObject = imageObjectDefault;
                      store.canvas.add(imageObjectDefault);
                      store.canvas.moveTo(imageObjectDefault, index);
    
                      resolve();
                    },
                    { crossOrigin: 'anonymous' }
                  );
                });
                imagePromises.push(imagePromise);
              }
              break;
    
            case 'text':

              if (element.properties.timelineOnly) {
                break;
              }
              const TextClass = fabric.Textbox;
              const backgroundColor = element.properties.backgroundColor.startsWith(
                '#'
              )
                ? `${element.properties.backgroundColor}${Math.floor(
                    element.properties.backgroundOpacity * 255
                  )
                    .toString(16)
                    .padStart(2, '0')}`
                : element.properties.backgroundColor;
    
              const textColor = element.properties.color.startsWith('#')
                ? `${element.properties.color}${Math.floor(
                    (element.properties.opacity || 1) * 255
                  )
                    .toString(16)
                    .padStart(2, '0')}`
                : element.properties.color;
    
              const strokeColor = element.properties.strokeColor.startsWith('#')
                ? `${element.properties.strokeColor}${Math.floor(
                    (element.properties.strokeOpacity || 1) * 255
                  )
                    .toString(16)
                    .padStart(2, '0')}`
                : element.properties.strokeColor;
    
              const textObject = new TextClass(element.properties.text, {
                name: element.id,
                left: element.placement.x,
                top: element.placement.y,
                width: element.placement.width || 900,
                height: element.placement.height || 100,
                scaleX: element.placement.scaleX,
                scaleY: element.placement.scaleY,
                angle: element.placement.rotation,
                fontSize: element.properties.fontSize,
                fontWeight: element.properties.fontWeight,
                fontFamily: element.properties.font,
                fontStyle: element.properties.fontStyle || 'normal',
                backgroundColor,
                fill: textColor,
                stroke: strokeColor,
                strokeWidth: element.properties.stroke,
                strokeMiterLimit: 2,
                strokeDashArray: null,
                strokeDashOffset: 0,
                strokeLineCap: 'butt',
                strokeLineJoin: 'miter',
                shadow:
                  element.properties.shadow &&
                  (element.properties.shadow.blur > 0 ||
                    element.properties.shadow.offsetX !== 0 ||
                    element.properties.shadow.offsetY !== 0)
                    ? (() => {
                        const shadowObj = new fabric.Shadow({
                          color: element.properties.shadow.color || '#000000',
                          blur: element.properties.shadow.blur || 0,
                          offsetX: element.properties.shadow.offsetX || 0,
                          offsetY: element.properties.shadow.offsetY || 0,
                          opacity: element.properties.shadow.opacity || 1,
                        });
                        return shadowObj;
                      })()
                    : null,
                textAlign: element.properties.textAlign,
                originX: 'center',
                originY: element.properties.verticalAlign,
                padding: 6,
                paintFirst: 'stroke',
                objectCaching: true,
                selectable: true,
                editable: true,
                lockUniScaling: true,
              });
    

              textObject.on('mousedown', () => {
                if (!textObject.isEditing) {
                  store.setCurrentTimeInMs(element.timeFrame.end);
                }
              });
    
              element.fabricObject = textObject;
              store.canvas.add(textObject);
              store.canvas.moveTo(textObject, index);
              textObject.bringToFront();
    

              if (element.subType === 'subtitles') {
                store.createSubtitleBackground(element, textObject);
              }
    

              if (element.properties.words?.length > 0) {

                if (
                  !element.properties.wordObjects ||
                  element.properties.wordObjects.length === 0
                ) {
                  store.initializeWordAnimations(element);
                } else {

                  store.updateWordObjects(element, textObject);
                }
              }
    

              textObject.on('editing:entered', () => {
                if (element.subType === 'subtitles') {

                  if (element.properties.wordObjects?.length > 0) {
                    element.properties.wordObjects.forEach(obj => {
                      if (obj && store.canvas.contains(obj)) {
                        store.canvas.remove(obj);
                      }
                    });
                    element.properties.wordObjects = [];
                  }
    

                  textObject.set({
                    opacity: 1,
                    fill: element.properties.color,
                    stroke: element.properties.strokeColor,
                    backgroundColor: 'transparent',
                  });
                } else {
                  textObject.set({ backgroundColor: 'transparent' });
                }
                store.canvas.requestRenderAll();
              });
    
              textObject.on('editing:exited', () => {
                if (element.subType === 'subtitles') {

                  const currentText = textObject.text;
                  element.properties.text = currentText;
    

                  if (element.properties.wordObjects?.length > 0) {
                    element.properties.wordObjects.forEach(obj => {
                      if (obj && store.canvas.contains(obj)) {
                        store.canvas.remove(obj);
                      }
                    });
                    element.properties.wordObjects = [];
                  }
    

                  store.initializeWordAnimations(element);
    

                  textObject.set('opacity', 0);
                }
                textObject.set({ backgroundColor });
                store.handleObjectModified(textObject, element);
                store.canvas.requestRenderAll();
              });
    
              textObject.on('changed', () => {
                if (element.subType === 'subtitles' && textObject.isEditing) {

                  const newText = textObject.text;
                  const segmentDuration =
                    element.timeFrame.end - element.timeFrame.start;
                  const oldText = element.properties.text;
                  const oldWords = oldText.trim().split(/\s+/);
                  const newWords = newText.trim().split(/\s+/);
    

                  const wordTimings = new Map();
                  (element.properties.words || []).forEach((word, index) => {
                    wordTimings.set(oldWords[index], word);
                  });
    

                  const totalChars = newWords.reduce((sum, w) => sum + w.length, 0);
    
                  const updatedWords = newWords.map((word, index) => {
                    const existingTiming = wordTimings.get(word);
                    if (existingTiming) {
                      return {
                        ...existingTiming,
                        word,
                      };
                    }

                    const wordStart =
                      element.timeFrame.start +
                      (segmentDuration *
                        newWords
                          .slice(0, index)
                          .reduce((sum, w) => sum + w.length, 0)) /
                        (totalChars || 1);
                    return {
                      word,
                      start: Math.round(wordStart),
                      end: element.timeFrame.end,
                    };
                  });
    
                  element.properties.text = newText;
                  element.properties.words = updatedWords;

                }
              });
    
              break;
    
            case 'audio':

              if (!document.getElementById(element.properties.elementId)) {

                const audioElement = document.createElement('audio');
                audioElement.id = element.properties.elementId;
                audioElement.src = element.properties.src;
                audioElement.preload = 'metadata';
                audioElement.volume = store.volume;
                audioElement.style.display = 'none';
                document.body.appendChild(audioElement);
              }
              break;
    
            default:
              continue;
          }
    

          if (element.fabricObject) {
            element.fabricObject.on('selected', () => {
              store.setSelectedElement(element);
            });
            store.canvas.moveTo(element.fabricObject, index);
          }
        }
    

        if (imagePromises.length > 0) {
          await Promise.all(imagePromises);
        }
    

        const selectedEditorElement = store.selectedElement;
        if (selectedEditorElement?.fabricObject) {
          store.canvas.setActiveObject(selectedEditorElement.fabricObject);
        }
    

        store.refreshAnimations();
        store.updateTimeTo(store.currentTimeInMs);
    

        store.editorElements.forEach(element => {
          if (element.type === 'text' && element.properties.wordObjects) {
            store.updateWordZIndex(element);
          }
        });
    

        store.canvas.requestRenderAll();
      } catch (error) {
        console.error('Error in refreshElements:', error);
      } finally {
        store.isRefreshingElements = false;
      }
    };  
