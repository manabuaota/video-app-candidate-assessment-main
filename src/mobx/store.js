import { makeAutoObservable, observable, action, runInAction } from 'mobx';
import { fabric } from 'fabric';
import { getUid, isHtmlAudioElement, isHtmlVideoElement } from '../utils';
import MP4Box from 'mp4box';
import anime from 'animejs';
import { v4 as uuidv4 } from 'uuid';
import { convertCurveToEasing } from '../components/PlayerComponent/entity/AnimationResource';
import { GLTransitionRenderer } from '../utils/gl-transitions';
import { captureFabricObjectState } from '../utils/fabric-utils';
import {
  refreshAnimationsUtil,
  updateTimeToUtil,
  refreshElementsUtil,
} from './store-modules';
import { handleCatchError } from '../utils/errorHandler';

export class Store {
  constructor() {

    this.drawnPaths = [];


    this._isSaving = false;


    this.isSelectingOrigin = false;
    this.originSelectionCallback = null;
    this.originSelectionElement = null;
    this.eyeCursor = null;
    this.originMarker = null;


    this.glTransitionRenderer = null;
    this.glTransitionElements = new Map()

    this.MAX_ACTIVE_GL_RENDERERS = 8;

    this.GL_SEEK_TEXTURE_UPDATE_INTERVAL_MS = 16
    this._glSeekTextureUpdateTs = 0;

    this._glOrphanMissCounts = new Map();

    this.LAZY_GL_SETUP = true;

    this.storyId = '';
    this.canvas = null;
    this.videos = [];
    this.images = [];
    this.audios = [];
    this.editorElements = [];
    this.hiddenSubtitles = [];
    this.backgroundColor = '#000000';
    this.maxTime = 0
    this.playing = false;
    this.currentKeyFrame = 0;
    this.selectedElement = null;
    this.selectedElements = null;
    this.coppiedElements = null;
    this.fps = 60;
    this.animations = [];
    this.subtitlesAnimation = 'textWordAnimation';
    this.animationTimeLine = anime.timeline();
    this.selectedMenuOption = 'Export';
    this.selectedVideoFormat = 'mp4';
    this.possibleVideoFormats = ['mp4', 'webm'];
    this.playbackRate = 1;

    this.setPlaybackRate = action(rate => {
      this.playbackRate = rate;
      this.updateAllMediaPlaybackRates();
    });
    this.startedTime = 0;
    this.startedTimePlay = 0;
    this.isDragging = false;
    this.draggedItem = null;
    this.ghostElement = null;
    this.ghostMarkerPosition = null;
    this.dragInfo = null;
    this.maxRows = 3;
    this.volume = 0.05;
    this.playbackRate = 1;
    this.applyToAll = false;
    this.synchronise = true;
    this.refreshDebounceTimeout = null;
    this.pendingUpdates = new Set();
    this.lastPosition = null;
    this.lastUpdateTime = 0;
    this.updateThreshold = 5
    this.updateInterval = 50
    this.batchedAnimationUpdates = new Set();
    this.animationUpdateTimeout = null;
    this.isRefreshingAnimations = false;
    this.isRefreshingElements = false;
    this.ANIMATION_BATCH_DELAY = 16;

    this.dragState = {
      isDragging: false,
      lastValue: null,
      rafId: null,
      updates: new Map(),
      lastUpdateTime: 0,
      updateInterval: 16,
      accumulatedUpdates: new Map(),
    };

    this.moveState = {
      isMoving: false,
      rafId: null,
      lastUpdateTime: 0,
      updateInterval: 16,
      accumulatedMoves: new Map(),
    };


    this.handleObjectModified = this.handleObjectModified.bind(this);


    this.history = [];
    this.currentHistoryIndex = -1;
    this.isUndoRedoOperation = false;

    this.isInitializing = false;

    this.debouncedSaveToHistory = (() => {
      let timeoutId = null;
      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          timeoutId = null;
        }, 500)
      };
    })();

    this.autoAdjustDuration = true;

    this.isResizing = false;


    this.currentAspectRatio = { width: 9, height: 16 };


    this.subtitlesPanelState = observable({
      isPunctuationEnabled: true,
      wordSpacingFactor: -13,
      letterSpacingFactor: 0,
      lineHeightFactor: 1.2,
      textCase: 'none',
    });


    this.colorPickerState = observable({
      buttonColors: {
        Font: '#ffffff',
        Fill: '#000000',
        Shadow: '#808080',
        Outline: '#ffffff',
        Motion: '#ff0000',
        'Auto HL': '#ffff00',
      },
      opacities: {
        Font: 100,
        Fill: 100,
        Shadow: 100,
        Outline: 100,
        Motion: 100,
        'Auto HL': 100,
      },
      shadowSettings: {
        distance: 10,
        blur: 10,
        angle: 0,
        sliderValue: 50,
      },
      strokeWidth: 12,
      backgroundRadius: 0,
    });


    this.updateColorPickerButtonColor = action((buttonType, color) => {
      this.colorPickerState.buttonColors[buttonType] = color;
    });

    this.updateColorPickerOpacity = action((buttonType, opacity) => {
      this.colorPickerState.opacities[buttonType] = opacity;
    });

    this.updateColorPickerShadowSettings = action(settings => {
      Object.assign(this.colorPickerState.shadowSettings, settings);
    });

    this.updateColorPickerStrokeWidth = action(width => {
      this.colorPickerState.strokeWidth = width;
    });

    this.updateColorPickerBackgroundRadius = action(radius => {
      this.colorPickerState.backgroundRadius = radius;
    });


    this.togglePunctuation = action(value => {
      runInAction(() => {
        this.subtitlesPanelState.isPunctuationEnabled = value;
        const subtitles = this.editorElements.filter(
          el => el.subType === 'subtitles'
        );

        if (subtitles.length > 0) {
          subtitles.forEach(subtitle => {

            if (!subtitle.properties.originalText) {
              subtitle.properties.originalText = subtitle.properties.text;
            }

            if (value === false) {

              subtitle.properties.text = (
                subtitle.properties.originalText || subtitle.properties.text
              )
                .replaceAll('.', '')
                .replaceAll(',', '');

              if (subtitle.properties.words) {
                subtitle.properties.words = subtitle.properties.words.map(
                  word => {
                    if (!word.originalWord) {
                      word.originalWord = word.word;
                    }
                    return {
                      ...word,
                      word: (word.originalWord || word.word)
                        .replaceAll('.', '')
                        .replaceAll(',', ''),
                    };
                  }
                );
              }
            } else {
              subtitle.properties.text =
                subtitle.properties.originalText || subtitle.properties.text;

              if (subtitle.properties.words) {
                subtitle.properties.words = subtitle.properties.words.map(
                  word => ({
                    ...word,
                    word: word.originalWord || word.word,
                  })
                );
              }
            }
          });

          this.refreshElements();
        }
      });
    });


    this.setWordSpacing = action(async value => {
      runInAction(() => {
        this.subtitlesPanelState.wordSpacingFactor = value;


        const currentTime = this.currentTimeInMs;
        const wasPlaying = this.playing;


        if (wasPlaying) {
          this.setPlaying(false);
        }


        this.animations = this.animations.filter(
          a => a.type !== 'textWordAnimation'
        );


        if (this.animationTimeLine) {
          anime.remove(this.animationTimeLine);
          this.animationTimeLine = anime.timeline({
            duration: this.maxTime,
            autoplay: false,
          });
        }


        this.editorElements.forEach(element => {
          if (element.type === 'text' && element.subType === 'subtitles') {

            if (element.properties.wordObjects?.length > 0) {
              element.properties.wordObjects.forEach(obj => {
                if (obj && this.canvas?.contains(obj)) {
                  this.canvas.remove(obj);
                }
              });
              element.properties.wordObjects = [];
            }


            if (element.fabricObject) {
              element.fabricObject.set('opacity', 1);
            }
          }
        });


        this.canvas.requestRenderAll();


        requestAnimationFrame(() => {

          this.editorElements.forEach(element => {
            if (element.type === 'text' && element.subType === 'subtitles') {
              if (element.fabricObject) {

                this.initializeWordAnimations(element);


                this.animations.push({
                  id: `${element.id}-word-animation`,
                  targetId: element.id,
                  type: 'textWordAnimation',
                  effect: 'in',
                  duration: 500,
                  properties: {},
                });
              }
            }
          });


          requestAnimationFrame(() => {

            this.refreshAnimations();


            this.animationTimeLine.seek(currentTime);


            this.editorElements.forEach(element => {
              if (element.type === 'text' && element.subType === 'subtitles') {
                const isInside =
                  element.timeFrame.start <= currentTime &&
                  currentTime <= element.timeFrame.end;


                if (element.fabricObject) {
                  element.fabricObject.set('opacity', 0);
                }


                if (element.properties.wordObjects) {
                  element.properties.wordObjects.forEach((wordObj, index) => {
                    if (wordObj && element.properties.words?.[index]) {
                      const word = element.properties.words[index];
                      const wordIsInside =
                        isInside &&
                        word.start <= currentTime &&
                        currentTime <= word.end;
                      wordObj.set('visible', wordIsInside);
                    }
                  });
                }
              }
            });


            this.canvas.requestRenderAll();


            if (wasPlaying) {
              setTimeout(() => {
                this.setPlaying(true);
              }, 100);
            }
          });
        });
      });
    });


    this.setLetterSpacing = action(async value => {
      runInAction(() => {
        this.subtitlesPanelState.letterSpacingFactor = value;


        const currentTime = this.currentTimeInMs;
        const wasPlaying = this.playing;


        if (wasPlaying) {
          this.setPlaying(false);
        }


        this.animations = this.animations.filter(
          a => a.type !== 'textWordAnimation'
        );


        if (this.animationTimeLine) {
          anime.remove(this.animationTimeLine);
          this.animationTimeLine = anime.timeline({
            duration: this.maxTime,
            autoplay: false,
          });
        }


        this.editorElements.forEach(element => {
          if (element.type === 'text' && element.subType === 'subtitles') {

            if (element.properties.wordObjects?.length > 0) {
              element.properties.wordObjects.forEach(obj => {
                if (obj && this.canvas?.contains(obj)) {
                  this.canvas.remove(obj);
                }
              });
              element.properties.wordObjects = [];
            }


            if (element.fabricObject) {
              element.fabricObject.set('opacity', 1);
            }
          }
        });


        this.canvas.requestRenderAll();


        requestAnimationFrame(() => {

          this.editorElements.forEach(element => {
            if (element.type === 'text' && element.subType === 'subtitles') {
              if (element.fabricObject) {

                this.initializeWordAnimations(element);


                this.animations.push({
                  id: `${element.id}-word-animation`,
                  targetId: element.id,
                  type: 'textWordAnimation',
                  effect: 'in',
                  duration: 500,
                  properties: {},
                });
              }
            }
          });


          requestAnimationFrame(() => {

            this.refreshAnimations();


            this.animationTimeLine.seek(currentTime);


            this.editorElements.forEach(element => {
              if (element.type === 'text' && element.subType === 'subtitles') {
                const isInside =
                  element.timeFrame.start <= currentTime &&
                  currentTime <= element.timeFrame.end;

                if (element.properties.wordObjects) {
                  element.properties.wordObjects.forEach((wordObj, index) => {
                    if (wordObj) {
                      const word = element.properties.words[index];
                      const wordIsInside =
                        isInside &&
                        word.start <= currentTime &&
                        currentTime <= word.end;
                      wordObj.set('visible', wordIsInside);
                    }
                  });
                }
              }
            });


            this.canvas.requestRenderAll();


            if (wasPlaying) {
              setTimeout(() => {
                this.setPlaying(true);
              }, 100);
            }
          });
        });
      });
    });


    this.setLineHeight = action(async value => {
      runInAction(() => {
        this.subtitlesPanelState.lineHeightFactor = value;


        const currentTime = this.currentTimeInMs;
        const wasPlaying = this.playing;


        if (wasPlaying) {
          this.setPlaying(false);
        }


        this.animations = this.animations.filter(
          a => a.type !== 'textWordAnimation'
        );


        if (this.animationTimeLine) {
          anime.remove(this.animationTimeLine);
          this.animationTimeLine = anime.timeline({
            duration: this.maxTime,
            autoplay: false,
          });
        }


        this.editorElements.forEach(element => {
          if (element.type === 'text' && element.subType === 'subtitles') {

            if (element.properties.wordObjects?.length > 0) {
              element.properties.wordObjects.forEach(obj => {
                if (obj && this.canvas?.contains(obj)) {
                  this.canvas.remove(obj);
                }
              });
              element.properties.wordObjects = [];
            }


            if (element.fabricObject) {
              element.fabricObject.set('opacity', 1);
            }
          }
        });


        this.canvas.requestRenderAll();


        requestAnimationFrame(() => {

          this.editorElements.forEach(element => {
            if (element.type === 'text' && element.subType === 'subtitles') {
              if (element.fabricObject) {

                this.initializeWordAnimations(element);


                this.animations.push({
                  id: `${element.id}-word-animation`,
                  targetId: element.id,
                  type: 'textWordAnimation',
                  effect: 'in',
                  duration: 500,
                  properties: {},
                });
              }
            }
          });


          requestAnimationFrame(() => {

            this.refreshAnimations();


            this.animationTimeLine.seek(currentTime);


            this.editorElements.forEach(element => {
              if (element.type === 'text' && element.subType === 'subtitles') {
                const isInside =
                  element.timeFrame.start <= currentTime &&
                  currentTime <= element.timeFrame.end;

                if (element.properties.wordObjects) {
                  element.properties.wordObjects.forEach((wordObj, index) => {
                    if (wordObj) {
                      const word = element.properties.words[index];
                      const wordIsInside =
                        isInside &&
                        word.start <= currentTime &&
                        currentTime <= word.end;
                      wordObj.set('visible', wordIsInside);
                    }
                  });
                }
              }
            });


            this.canvas.requestRenderAll();


            if (wasPlaying) {
              setTimeout(() => {
                this.setPlaying(true);
              }, 100);
            }
          });
        });
      });
    });


    this.setTextCase = action(async value => {
      runInAction(() => {
        this.subtitlesPanelState.textCase = value;


        const subtitles = this.editorElements.filter(
          el => el.subType === 'subtitles'
        );

        if (subtitles.length > 0) {
          subtitles.forEach(subtitle => {

            if (!subtitle.properties.originalText) {
              subtitle.properties.originalText = subtitle.properties.text;
            }


            let transformedText = subtitle.properties.originalText;

            switch (value) {
              case 'uppercase':
                transformedText = transformedText.toUpperCase();
                break;
              case 'lowercase':
                transformedText = transformedText.toLowerCase();
                break;
              case 'capitalize':
                transformedText = transformedText.replace(/\b\w/g, char =>
                  char.toUpperCase()
                );
                break;
              case 'none':
              default:
                transformedText = subtitle.properties.originalText;
                break;
            }

            subtitle.properties.text = transformedText;


            if (subtitle.properties.words) {
              subtitle.properties.words = subtitle.properties.words.map(
                word => {
                  if (!word.originalWord) {
                    word.originalWord = word.word;
                  }

                  let transformedWord = word.originalWord;

                  switch (value) {
                    case 'uppercase':
                      transformedWord = transformedWord.toUpperCase();
                      break;
                    case 'lowercase':
                      transformedWord = transformedWord.toLowerCase();
                      break;
                    case 'capitalize':
                      transformedWord = transformedWord.replace(/\b\w/g, char =>
                        char.toUpperCase()
                      );
                      break;
                    case 'none':
                    default:
                      transformedWord = word.originalWord;
                      break;
                  }

                  return {
                    ...word,
                    word: transformedWord,
                  };
                }
              );
            }
          });


          this.refreshElements();
        }
      });
    });


    this.ghostState = observable({
      isDragging: false,
      ghostElement: null,
      ghostMarkerPosition: null,
      draggedElement: null,
      alignmentLines: [],
      snapThreshold: 20,
      lastAlignmentUpdate: 0,
      lastHoverCheck: 0,
      isIncompatibleRow: false,
      initialClickOffset: 0,
      initialClientX: null,
      initialElementStart: 0,

      isResizing: false,
      resizeType: null,
      resizeGhostElement: null,
      resizeTargetElement: null,

      isMultiDragging: false,
      multiGhostElements: [],
      selectedElements: [],
      initialElementStarts: [],

      livePushOffsets: new Map(),
      enablePushOnDrag: true,

      isGalleryDragging: false,
      galleryGhostElement: null,
      galleryItemData: null,

      isFileDragging: false,
      fileGhostElement: null,
      fileData: null,

      isDraggingRow: false,
      draggedRowIndex: null,
      dragOverRowIndex: null,
    });

    makeAutoObservable(this, {
      dragState: false,
      moveState: false,
      history: false,
      currentHistoryIndex: false,
      isUndoRedoOperation: false,
      isInitializing: false,
      debouncedSaveToHistory: false,
      isSplitting: true,
      lastElementEnd: true,
      isResizing: true,
    });


    this.startOriginSelection = (element, callback) => {

      if (!element || !element.fabricObject || !this.canvas) {
        console.error(
          'Cannot start origin selection: Invalid element, missing fabricObject, or no canvas'
        );
        return;
      }


      if (this.isSelectingOrigin) {
        this.cleanupOriginSelection();
      }

      this.isSelectingOrigin = true;
      this.originSelectionElement = element;
      this.originSelectionCallback = callback;


      this.canvas.getObjects().forEach(obj => {
        if (obj !== this.originMarker) {
          obj.selectable = false;
          obj.evented = false;
        }
      });


      let initialPosition = {
        x:
          element.fabricObject.left +
          (element.fabricObject.width * element.fabricObject.scaleX) / 2,
        y:
          element.fabricObject.top +
          (element.fabricObject.height * element.fabricObject.scaleY) / 2,
      };


      if (element.properties?.origin?.type === 'custom') {
        initialPosition = {
          x: element.properties.origin.absoluteX,
          y: element.properties.origin.absoluteY,
        };
      }


      if (!this.originMarker) {
        this.originMarker = new fabric.Group(
          [
            new fabric.Circle({
              radius: 48,
              fill: 'rgba(33, 150, 243, 0.2)',
              stroke: '#2196F3',
              strokeWidth: 2,
              originX: 'center',
              originY: 'center',
            }),
            new fabric.Circle({
              radius: 36,
              fill: '#2196F3',
              originX: 'center',
              originY: 'center',
            }),
            new fabric.Line([-36, 0, 36, 0], {
              stroke: '#2196F3',
              strokeWidth: 2,
              originX: 'center',
              originY: 'center',
            }),
            new fabric.Line([0, -36, 0, 36], {
              stroke: '#2196F3',
              strokeWidth: 2,
              originX: 'center',
              originY: 'center',
            }),
          ],
          {
            left: initialPosition.x,
            top: initialPosition.y,
            selectable: true,
            evented: true,
            originX: 'center',
            originY: 'center',
            hasControls: false,
            hasBorders: false,
            lockRotation: true,
          }
        );


        this.originMarker.on('moving', () => {
          const marker = this.originMarker;
          const markerRadius = 48;


          const canvasWidth = this.canvas.width;
          const canvasHeight = this.canvas.height;


          let left = marker.left;
          let top = marker.top;


          if (left < markerRadius) {
            left = markerRadius;
          } else if (left > canvasWidth - markerRadius) {
            left = canvasWidth - markerRadius;
          }


          if (top < markerRadius) {
            top = markerRadius;
          } else if (top > canvasHeight - markerRadius) {
            top = canvasHeight - markerRadius;
          }


          marker.set({
            left: left,
            top: top,
          });

          this.canvas.requestRenderAll();
        });


        this.originMarker.on('modified', () => {
          const marker = this.originMarker;
          const markerRadius = 48;


          const canvasWidth = this.canvas.width;
          const canvasHeight = this.canvas.height;


          let left = Math.min(
            Math.max(marker.left, markerRadius),
            canvasWidth - markerRadius
          );
          let top = Math.min(
            Math.max(marker.top, markerRadius),
            canvasHeight - markerRadius
          );

          const currentPosition = {
            x: left,
            y: top,
          };

          const fabricObject = element.fabricObject;
          const elementLeft = fabricObject.left;
          const elementTop = fabricObject.top;
          const elementWidth = fabricObject.width * fabricObject.scaleX;
          const elementHeight = fabricObject.height * fabricObject.scaleY;

          const relativeX =
            ((currentPosition.x - elementLeft) / elementWidth) * 100;
          const relativeY =
            ((currentPosition.y - elementTop) / elementHeight) * 100;

          const customOrigin = {
            type: 'custom',
            x: Math.max(0, Math.min(100, relativeX)),
            y: Math.max(0, Math.min(100, relativeY)),
            absoluteX: currentPosition.x,
            absoluteY: currentPosition.y,
          };


          marker.set({
            left: currentPosition.x,
            top: currentPosition.y,
          });


          if (element.properties) {
            element.properties.origin = customOrigin;
          }

          if (this.originSelectionCallback) {
            this.originSelectionCallback(customOrigin);
          }
        });


        this.originMarker.on('mouseup', () => {
          const marker = this.originMarker;
          const markerRadius = 48;


          const canvasWidth = this.canvas.width;
          const canvasHeight = this.canvas.height;


          let left = Math.min(
            Math.max(marker.left, markerRadius),
            canvasWidth - markerRadius
          );
          let top = Math.min(
            Math.max(marker.top, markerRadius),
            canvasHeight - markerRadius
          );


          marker.set({
            left: left,
            top: top,
          });

          this.canvas.requestRenderAll();
        });


        this.canvas.add(this.originMarker);
        this.canvas.setActiveObject(this.originMarker);
      } else {

        this.originMarker.set({
          left: initialPosition.x,
          top: initialPosition.y,
        });
        this.canvas.setActiveObject(this.originMarker);
      }

      this.canvas.requestRenderAll();
    };

    this.cleanupOriginSelection = () => {

      this.isSelectingOrigin = false;
      this.originSelectionElement = null;
      this.originSelectionCallback = null;


      if (this.canvas) {
        this.canvas.getObjects().forEach(obj => {
          obj.selectable = true;
          obj.evented = true;
        });
        this.canvas.requestRenderAll();
      }


      if (this.originMarker && !this.isSelectingOrigin) {
        this.canvas.remove(this.originMarker);
        this.canvas.renderAll();
        this.originMarker = null;
      }
    };

    this.cancelOriginSelection = () => {
      this.cleanupOriginSelection();
    };

    this.handleOriginSelection = event => {
      if (
        !this.isSelectingOrigin ||
        !this.originSelectionElement ||
        !this.originSelectionCallback ||
        !this.originMarker ||
        !this.canvas
      )
        return;


      if (this.originMarker.dragging) return;

      const markerRadius = 48;
      const canvasWidth = this.canvas.width;
      const canvasHeight = this.canvas.height;


      let left = event.e.offsetX;
      let top = event.e.offsetY;


      if (left < markerRadius) {
        left = markerRadius;
      } else if (left > canvasWidth - markerRadius) {
        left = canvasWidth - markerRadius;
      }


      if (top < markerRadius) {
        top = markerRadius;
      } else if (top > canvasHeight - markerRadius) {
        top = canvasHeight - markerRadius;
      }

      const element = this.originSelectionElement;
      const fabricObject = element.fabricObject;

      if (!fabricObject) return;


      const elementLeft = fabricObject.left;
      const elementTop = fabricObject.top;
      const elementWidth = fabricObject.width * fabricObject.scaleX;
      const elementHeight = fabricObject.height * fabricObject.scaleY;


      const relativeX = ((left - elementLeft) / elementWidth) * 100;
      const relativeY = ((top - elementTop) / elementHeight) * 100;


      const customOrigin = {
        type: 'custom',
        x: Math.max(0, Math.min(100, relativeX)),
        y: Math.max(0, Math.min(100, relativeY)),
        absoluteX: left,
        absoluteY: top,
      };


      this.originMarker.set({
        left: left,
        top: top,
      });


      this.originSelectionCallback(customOrigin);

      this.canvas.requestRenderAll();
    };

    this.eyeCursor = null;

    this.isInitializationInProgress = false;
    this.isRecording = false;
  }

  refreshAnimations() {
    refreshAnimationsUtil(this);
  }

  setVolume(value, internal = false) {
    this.volume = value;


    if (!internal) {
      this.editorElements.forEach(element => {
        if (element.type === 'audio') {


          element.properties.volume = value * 2;


          const audio = document.getElementById(element.properties.elementId);
          if (audio) {
            audio.volume = Math.min(value, 1)
          }
        }
      });


      window.dispatchEvent(
        new CustomEvent('globalVolumeChanged', {
          detail: { volume: value },
        })
      );
    }
  }


  setElementVolume(elementId, volume) {
    const element = this.editorElements.find(el => el.id === elementId);
    if (element && element.type === 'audio') {

      if (!element.properties) {
        element.properties = {};
      }
      element.properties.volume = Math.max(0, Math.min(1, volume))


      const audio = document.getElementById(element.properties.elementId);
      if (audio) {

        const finalVolume = element.properties.volume * this.volume;
        audio.volume = Math.max(0, Math.min(1, finalVolume));
      }


      if (this.selectedElement?.id === elementId) {
        this.selectedElement.properties = {
          ...this.selectedElement.properties,
          volume,
        };
      }


      if (window.dispatchSaveTimelineState) {
        window.dispatchSaveTimelineState(this);
      }
    }
  }


  setElementsVolume(elementIds, volume) {
    if (!Array.isArray(elementIds) || elementIds.length === 0) {
      return;
    }

    elementIds.forEach(elementId => {
      this.setElementVolume(elementId, volume);
    });
  }


  get lastElementEnd() {
    const lastElement = this.editorElements
      .slice()
      .sort((a, b) => b.timeFrame.end - a.timeFrame.end)[0];
    return lastElement ? lastElement.timeFrame.end : 0;
  }

  async setPlaybackRate(value) {
    const wasPlaying = this.playing;
    const currentTime = this.currentTimeInMs;

    if (wasPlaying) {
      this.setPlaying(false);
    }

    this.playbackRate = value;


    this.videos.forEach(video => {
      if (video.element) {
        video.element.playbackRate = value;
      }
    });

    const audioProcessor = (await import('../utils/audioProcessor')).default;


    if (audioProcessor.isSupported()) {
      try {

        for (const audio of this.audios) {
          if (audio.element) {
            await audioProcessor.updateAudioPlaybackRate(audio.element, value);
          }
        }


        for (const element of this.editorElements) {
          if (element.type === 'audio') {
            const audio = document.getElementById(element.properties.elementId);
            if (audio) {
              await audioProcessor.updateAudioPlaybackRate(audio, value);
            }
          }
        }
      } catch (error) {
        handleCatchError(
          error,
          'Web Audio API error, falling back to HTML5',
          false
        );

        this.audios.forEach(audio => {
          if (audio.element) {
            audio.element.playbackRate = value;
          }
        });

        this.editorElements.forEach(element => {
          if (element.type === 'audio') {
            const audio = document.getElementById(element.properties.elementId);
            if (audio) {
              audio.playbackRate = value;
            }
          }
        });
      }
    } else {

      this.audios.forEach(audio => {
        if (audio.element) {
          audio.element.playbackRate = value;
        }
      });

      this.editorElements.forEach(element => {
        if (element.type === 'audio') {
          const audio = document.getElementById(element.properties.elementId);
          if (audio) {
            audio.playbackRate = value;
          }
        }
      });
    }


    this.editorElements.forEach(element => {
      if (element.type === 'video') {
        const video = document.getElementById(element.properties.elementId);
        if (video && isHtmlVideoElement(video)) {
          video.playbackRate = value;
        }
      }
    });


    if (wasPlaying) {

      const resumeDelay = value >= 1.5 ? 50 : 100;
      setTimeout(() => {
        this.setPlaying(true);
      }, resumeDelay);
    }
  }

  cleanup() {

    this.setPlaying(false);


    if (this.editorElements) {
      this.editorElements.forEach(element => {
        if (element.type === 'video') {
          const video = document.getElementById(element.properties?.elementId);
          if (video && !video.paused) {
            video.pause();

          }
        } else if (element.type === 'audio') {
          const audio = document.getElementById(element.properties?.elementId);
          if (audio) {
            audio.pause();

          }
        }
      });
    }


    this.canvas?.clear();
    this.canvas = null;
    this.guideline = null;
    this.videos = [];
    this.images = [];
    this.audios = [];
    this.editorElements = [];
    this.backgroundColor = '#111111';
    this.maxTime = 0
    this.playing = false;
    this.currentKeyFrame = 0;
    this.selectedElement = null;
    this.selectedElements = null;
    this.animations = [];
    this.animationTimeLine = anime.timeline();
    this.selectedMenuOption = 'Export';
    this.maxRows = 4;
    this.isDragging = false;
    this.draggedItem = null;
    this.ghostElement = null;
    this.ghostMarkerPosition = null;
    this.dragInfo = null;
    this.lastPosition = null;
    this.lastUpdateTime = 0;
    this.history = [];
    this.currentHistoryIndex = -1;
    this.isUndoRedoOperation = false;
  }

  async cleanupImages() {

    this.editorElements = this.editorElements.filter(
      element => !(element.type === 'imageUrl' && element.pointId)
    );
  }

  setMaxRows(newMaxRows) {
    this.maxRows = Math.max(this.maxRows, newMaxRows);
  }

  get availableRows() {
    return this.maxRows;
  }

  getElementsInRow(row) {
    return this.editorElements.filter(element => element.row === row);
  }

  get currentTimeInMs() {
    return (this.currentKeyFrame * 1000) / this.fps;
  }

  setCurrentTimeInMs(time) {
    this.currentKeyFrame = Math.floor((time / 1000) * this.fps);
  }

  setCurrentKeyFrame(keyFrame) {
    this.currentKeyFrame = keyFrame;
  }

  setSelectedMenuOption(selectedMenuOption) {
    this.selectedMenuOption = selectedMenuOption;
  }

  setStoryId(id) {
    this.storyId = id;
  }

  setCanvas(canvas) {
    this.canvas = canvas;
    if (canvas) {
      canvas.backgroundColor = this.backgroundColor;

      this.initGLTransitionRenderer();
    }
  }

  initGLTransitionRenderer() {
    if (!this.canvas) return;

    try {
      const canvasWidth = this.canvas.width;
      const canvasHeight = this.canvas.height;

      this.glTransitionRenderer = new GLTransitionRenderer(
        canvasWidth,
        canvasHeight
      );
    } catch (error) {
      handleCatchError(
        error,
        'Failed to initialize GL Transition Renderer',
        false
      );
      this.glTransitionRenderer = null;
    }
  }

  setBackgroundColor(backgroundColor) {
    this.backgroundColor = backgroundColor;
    if (this.canvas) {
      this.canvas.backgroundColor = backgroundColor;
    }
  }


  async addGLTransition(
    fromElementId,
    toElementId,
    transitionType,
    duration = 1000
  ) {
    if (!this.glTransitionRenderer) {
      console.error('GL Transition Renderer not initialized');
      return false;
    }

    const fromElement = this.editorElements.find(el => el.id === fromElementId);
    const toElement = this.editorElements.find(el => el.id === toElementId);

    if (!fromElement || !toElement) {
      console.error('Source or target element not found for GL transition');
      return false;
    }


    if (
      !isEditorVisualElement(fromElement) ||
      !isEditorVisualElement(toElement)
    ) {
      console.error('GL transitions only support image and video elements');
      return false;
    }

    try {

      const getMediaSource = element => {
        if (isEditorVideoElement(element)) {

          const videoElement = document.getElementById(
            element.properties?.elementId
          );
          if (
            videoElement &&
            videoElement.videoWidth &&
            videoElement.videoHeight
          ) {

            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0);
            return canvas.toDataURL('image/png');
          }

          return element.properties?.src || element.src || element.url;
        } else {

          return element.properties?.src || element.src || element.url;
        }
      };

      const fromMediaSrc = getMediaSource(fromElement);
      const toMediaSrc = getMediaSource(toElement);

      if (!fromMediaSrc || !toMediaSrc) {
        console.error('Media sources not found:', { fromMediaSrc, toMediaSrc });
        return false;
      }



      let rendererWidth, rendererHeight;

      if (
        isEditorVideoElement(fromElement) ||
        isEditorVideoElement(toElement)
      ) {
        const videoElement = isEditorVideoElement(fromElement)
          ? fromElement
          : toElement;
        const placement = videoElement.placement;


        rendererWidth = placement?.width || this.canvas.width;
        rendererHeight = placement?.height || this.canvas.height;
      } else {

        const fromFo = fromElement.fabricObject;
        const toFo = toElement.fabricObject;
        const fromRect = fromFo ? fromFo.getBoundingRect(true, true) : null;
        const toRect = toFo ? toFo.getBoundingRect(true, true) : null;
        if (fromRect && toRect) {
          const left = Math.min(fromRect.left, toRect.left);
          const top = Math.min(fromRect.top, toRect.top);
          const right = Math.max(
            fromRect.left + fromRect.width,
            toRect.left + toRect.width
          );
          const bottom = Math.max(
            fromRect.top + fromRect.height,
            toRect.top + toRect.height
          );
          rendererWidth = Math.max(1, Math.round(right - left));
          rendererHeight = Math.max(1, Math.round(bottom - top));
        } else {
          rendererWidth = this.canvas.width;
          rendererHeight = this.canvas.height;
        }
      }

      const transitionRenderer = new GLTransitionRenderer(
        rendererWidth,
        rendererHeight
      );


      const success = await transitionRenderer.loadTransition(
        transitionType,
        fromMediaSrc,
        toMediaSrc
      );

      if (!success) {
        console.error('Failed to load GL transition');
        return false;
      }


      const transitionId = getUid();
      const minDuration = 100
      const actualDuration = Math.max(duration, minDuration);



      const gapStart = fromElement.timeFrame.end;
      const gapEnd = toElement.timeFrame.start;
      const gapDuration = gapEnd - gapStart;

      let startTime, endTime;

      if (gapDuration === 0) {


        const transitionPoint = gapStart
        const beforeRatio = 0.6
        const afterRatio = 0.4
        startTime = transitionPoint - actualDuration * beforeRatio;
        endTime = transitionPoint + actualDuration * afterRatio;
      } else if (gapDuration >= actualDuration) {

        const gapCenter = gapStart + gapDuration / 2;
        startTime = gapCenter - actualDuration / 2;
        endTime = gapCenter + actualDuration / 2;
      } else {

        const gapCenter = gapStart + gapDuration / 2;
        startTime = gapCenter - actualDuration / 2;
        endTime = gapCenter + actualDuration / 2;
      }


      const finalDuration = actualDuration;


      const animationRow = this.findAvailableRowForGLTransition(
        fromElement,
        toElement
      );

      const transitionAnimation = {
        id: transitionId,
        type: 'glTransition',
        fromElementId,
        toElementId,
        transitionType,
        duration: finalDuration,
        startTime,
        endTime,
        row: animationRow,
        manuallyAdjusted: false,
        targetIds: [fromElementId, toElementId],
        properties: {
          transitionType,
          duration: finalDuration,
          startTime,
          endTime,
        },
      };



      if (fromElement.fabricObject && !fromElement.initialState) {
        fromElement.initialState = {
          scaleX: fromElement.fabricObject.scaleX,
          scaleY: fromElement.fabricObject.scaleY,
          left: fromElement.fabricObject.left,
          top: fromElement.fabricObject.top,
          opacity: fromElement.fabricObject.opacity,
        };
      }
      if (toElement.fabricObject && !toElement.initialState) {
        toElement.initialState = {
          scaleX: toElement.fabricObject.scaleX,
          scaleY: toElement.fabricObject.scaleY,
          left: toElement.fabricObject.left,
          top: toElement.fabricObject.top,
          opacity: toElement.fabricObject.opacity,
        };
      }


      this.animations.push(transitionAnimation);


      const timelineElement = {
        id: `animation-${transitionId}`,
        animationId: transitionId,
        type: 'animation',
        targetId: fromElementId,
        fromElementId: fromElementId,
        toElementId: toElementId,
        targetIds: [fromElementId, toElementId],
        row: animationRow,
        timeFrame: {
          start: startTime,
          end: endTime,
        },
        properties: {
          animationType: 'glTransition',
          transitionType: transitionType,
          displayName: `${transitionType} Transition`,
          originalAnimation: transitionAnimation,
          effectDirection: 'transition',
        },

        absoluteStart: startTime,
        absoluteEnd: endTime,
        effectDirection: 'transition',
        displayName: `${transitionType} Transition`,
      };


      runInAction(() => {
        this.editorElements.push(timelineElement);
      });


      if (animationRow >= this.maxRows) {
        this.setMaxRows(animationRow + 1);
      }


      setTimeout(() => {
        runInAction(() => {
          const timelineEl = this.editorElements.find(
            el =>
              el.id === `animation-${transitionId}` && el.type === 'animation'
          );
          if (timelineEl) {
            timelineEl.timeFrame.start = startTime;
            timelineEl.timeFrame.end = endTime;
          }
        });

        this.refreshAnimations();
      }, 10);


      const transitionCanvas = transitionRenderer.getCanvas();



      let transitionProperties;

      if (
        isEditorVideoElement(fromElement) ||
        isEditorVideoElement(toElement)
      ) {

        const primaryElement = isEditorVideoElement(fromElement)
          ? fromElement
          : toElement;
        const placement = primaryElement.placement;

        transitionProperties = {
          left: placement?.x || 0,
          top: placement?.y || 0,
          width: placement?.width || transitionCanvas.width,
          height: placement?.height || transitionCanvas.height,
          scaleX: placement?.scaleX || 1,
          scaleY: placement?.scaleY || 1,
          selectable: false,
          evented: false,
          opacity: 0,
          originX: 'left',
          originY: 'top',
        };
      } else {

        const fromFo = fromElement.fabricObject;
        const toFo = toElement.fabricObject;
        const fromRect = fromFo ? fromFo.getBoundingRect(true, true) : null;
        const toRect = toFo ? toFo.getBoundingRect(true, true) : null;
        if (fromRect && toRect) {
          const left = Math.min(fromRect.left, toRect.left);
          const top = Math.min(fromRect.top, toRect.top);
          transitionProperties = {
            left: left,
            top: top,
            width: transitionCanvas.width,
            height: transitionCanvas.height,
            scaleX: 1,
            scaleY: 1,
            selectable: false,
            evented: false,
            opacity: 0,
            originX: 'left',
            originY: 'top',
          };
        } else {

          const scaleX = this.canvas.width / transitionCanvas.width;
          const scaleY = this.canvas.height / transitionCanvas.height;
          transitionProperties = {
            left: 0,
            top: 0,
            scaleX: scaleX,
            scaleY: scaleY,
            selectable: false,
            evented: false,
            opacity: 0,
            originX: 'left',
            originY: 'top',
          };
        }
      }

      const transitionFabricImage = new fabric.Image(
        transitionCanvas,
        transitionProperties
      );


      this.canvas.add(transitionFabricImage);


      this.canvas.bringToFront(transitionFabricImage);


      this.ensureElementsZOrder();


      this.glTransitionElements.set(transitionId, {
        animation: transitionAnimation,
        fabricObject: transitionFabricImage,
        renderer: transitionRenderer,
      });


      const currentTime = this.currentTimeInMs;
      const isTransitionActive =
        currentTime >= transitionAnimation.startTime &&
        currentTime <= transitionAnimation.endTime;

      if (isTransitionActive) {

        const progress =
          (currentTime - transitionAnimation.startTime) /
          (transitionAnimation.endTime - transitionAnimation.startTime);
        const clampedProgress = Math.max(0, Math.min(1, progress));


        this.updateGLTransition(transitionId, clampedProgress).catch(error => {
          console.error(
            'Error updating GL transition during initialization:',
            error
          );
        });


        transitionFabricImage.set('opacity', 1);


        if (fromElement && fromElement.fabricObject) {
          const shouldBeVisible = this.shouldElementBeVisibleWithGLTransitions(
            fromElement.id,
            currentTime,
            transitionId
          );

          fromElement.fabricObject.set('visible', false);
        }

        if (toElement && toElement.fabricObject) {
          const shouldBeVisible = this.shouldElementBeVisibleWithGLTransitions(
            toElement.id,
            currentTime,
            transitionId
          );

          toElement.fabricObject.set('visible', false);
        }


        this.canvas.requestRenderAll();
      } else {

        transitionFabricImage.set('opacity', 0);


        if (fromElement && fromElement.fabricObject) {
          const shouldBeVisible = this.shouldElementBeVisibleWithGLTransitions(
            fromElement.id,
            currentTime
          );
          fromElement.fabricObject.set('visible', shouldBeVisible);
        }
        if (toElement && toElement.fabricObject) {
          const shouldBeVisible = this.shouldElementBeVisibleWithGLTransitions(
            toElement.id,
            currentTime
          );
          toElement.fabricObject.set('visible', shouldBeVisible);
        }
      }


      this.synchronizeGLTransitionState(transitionId);


      this.manageGLTransitionConflicts(this.currentTimeInMs);


      if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
        window.dispatchSaveTimelineState(this);
      }
      return transitionId;
    } catch (error) {
      console.error('Error creating GL transition:', error);
      return false;
    }
  }


  async addDynamicGLTransition(
    transitionType,
    duration = 1000,
    targetRow = null
  ) {
    if (!this.glTransitionRenderer) {
      console.error('GL Transition Renderer not initialized');
      return false;
    }

    try {
      const transitionId = `gl-transition-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;


      const animationRow =
        targetRow !== null ? targetRow : this.findAvailableRow();


      const finalDuration = Math.max(100, duration);
      const startTime = 0
      const endTime = startTime + finalDuration;
      const transitionTimeFrame = { start: startTime, end: endTime };


      const dynamicTargetIds = this.getDynamicTargetIds(
        animationRow,
        transitionTimeFrame
      );



      let fromElementId = dynamicTargetIds[0];
      let toElementId =
        dynamicTargetIds.length > 1 ? dynamicTargetIds[1] : dynamicTargetIds[0];


      if (dynamicTargetIds.length === 0) {
        console.warn('No target elements found for dynamic GL transition');
        fromElementId = null;
        toElementId = null;
      }





      const transitionAnimation = {
        id: transitionId,
        type: 'glTransition',
        fromElementId,
        toElementId,
        targetIds: dynamicTargetIds,
        transitionType,
        duration: finalDuration,
        startTime,
        endTime,
        row: animationRow,
        properties: {
          absoluteStart: startTime,
          absoluteEnd: endTime,
        },
      };


      this.animations.push(transitionAnimation);


      const animationElement = {
        id: `animation-${transitionId}`,
        animationId: transitionId,
        type: 'animation',
        targetId: fromElementId,
        targetIds: dynamicTargetIds,
        fromElementId: fromElementId,
        toElementId: toElementId,
        row: animationRow,
        timeFrame: {
          start: startTime,
          end: endTime,
        },
      };

      this.editorElements.push(animationElement);


      if (fromElementId && toElementId) {
        const fromElement = this.editorElements.find(
          el => el.id === fromElementId
        );
        const toElement = this.editorElements.find(el => el.id === toElementId);

        if (fromElement && toElement) {

          await this.setupGLTransitionRenderer(
            transitionId,
            fromElement,
            toElement,
            transitionType
          );
        }
      }


      if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
        window.dispatchSaveTimelineState(this);
      }

      return transitionId;
    } catch (error) {
      console.error('Error creating dynamic GL transition:', error);
      return false;
    }
  }


  shouldElementBeVisibleWithGLTransitions(
    elementId,
    currentTime,
    excludeTransitionId = null
  ) {
    const element = this.editorElements.find(el => el.id === elementId);
    if (!element || !element.fabricObject) {
      return false;
    }


    const isInTimeframe =
      currentTime >= element.timeFrame.start &&
      currentTime <= element.timeFrame.end;
    if (!isInTimeframe) {
      return false;
    }


    const activeTransitions = this.animations.filter(
      anim =>
        anim.type === 'glTransition' &&
        (excludeTransitionId ? anim.id !== excludeTransitionId : true) &&
        currentTime >= anim.startTime &&
        currentTime <= anim.endTime &&
        (anim.fromElementId === elementId || anim.toElementId === elementId)
    );


    return activeTransitions.length === 0;
  }


  getHighestPriorityGLTransition(elementId, currentTime) {
    const activeTransitions = this.animations.filter(
      anim =>
        anim.type === 'glTransition' &&
        currentTime >= anim.startTime &&
        currentTime <= anim.endTime &&
        (anim.fromElementId === elementId || anim.toElementId === elementId)
    );

    if (activeTransitions.length === 0) {
      return null;
    }


    activeTransitions.sort((a, b) => b.startTime - a.startTime);
    return activeTransitions[0];
  }


  manageGLTransitionConflicts(currentTime) {

    const elementTransitionMap = new Map();

    this.animations.forEach(anim => {
      if (
        anim.type === 'glTransition' &&
        currentTime >= anim.startTime &&
        currentTime <= anim.endTime
      ) {
        [anim.fromElementId, anim.toElementId].forEach(elementId => {
          if (!elementTransitionMap.has(elementId)) {
            elementTransitionMap.set(elementId, []);
          }
          elementTransitionMap.get(elementId).push(anim);
        });
      }
    });


    elementTransitionMap.forEach((transitions, elementId) => {
      if (transitions.length > 1) {

        transitions.sort((a, b) => b.startTime - a.startTime);
        const highestPriorityTransition = transitions[0];

        console.log(
          `Element ${elementId} has ${transitions.length} active transitions, showing: ${highestPriorityTransition.id}`
        );


        transitions.forEach(transition => {
          const transitionElement = this.glTransitionElements.get(
            transition.id
          );
          if (transitionElement && transitionElement.fabricObject) {
            const shouldBeVisible =
              transition.id === highestPriorityTransition.id;
            transitionElement.fabricObject.set(
              'opacity',
              shouldBeVisible ? 1 : 0
            );
            console.log(
              `GL Transition ${transition.id} opacity: ${
                shouldBeVisible ? 1 : 0
              }`
            );
          }
        });
      }
    });
  }


  async setupGLTransitionRenderer(
    transitionId,
    fromElement,
    toElement,
    transitionType
  ) {
    try {

      if (this.glTransitionElements.size >= this.MAX_ACTIVE_GL_RENDERERS) {
        const candidates = Array.from(this.glTransitionElements.entries())
          .filter(([id, el]) => {
            const anim = this.animations.find(a => a.id === id);
            if (!anim || anim.type !== 'glTransition') return true
            const now = this.currentTimeInMs;
            const active = now >= anim.startTime && now <= anim.endTime;
            return !active;
          })
          .map(([id, el]) => ({ id, el }));
        if (candidates.length > 0) {
          const victim = candidates[0];
          if (victim.el.fabricObject && this.canvas) {
            this.canvas.remove(victim.el.fabricObject);
          }
          if (victim.el.renderer && victim.el.renderer.dispose) {
            victim.el.renderer.dispose();
          }
          this.glTransitionElements.delete(victim.id);
        }
      }

      const existingTransition = this.glTransitionElements.get(transitionId);
      if (existingTransition) {
        if (existingTransition.fabricObject && this.canvas) {
          this.canvas.remove(existingTransition.fabricObject);
        }
        if (
          existingTransition.renderer &&
          existingTransition.renderer.dispose
        ) {
          existingTransition.renderer.dispose();
        }
        this.glTransitionElements.delete(transitionId);
      }


      const getMediaSource = element => {
        if (isEditorVideoElement(element)) {
          const videoElement = document.getElementById(
            element.properties?.elementId
          );
          if (
            videoElement &&
            videoElement.videoWidth &&
            videoElement.videoHeight
          ) {
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0);
            return canvas.toDataURL('image/png');
          }
          return element.properties?.src || element.src || element.url;
        } else {
          return element.properties?.src || element.src || element.url;
        }
      };

      const fromMediaSrc = getMediaSource(fromElement);
      const toMediaSrc = getMediaSource(toElement);

      if (!fromMediaSrc || !toMediaSrc) {
        console.error('Media sources not found:', { fromMediaSrc, toMediaSrc });
        return false;
      }


      let rendererWidth, rendererHeight;

      if (
        isEditorVideoElement(fromElement) ||
        isEditorVideoElement(toElement)
      ) {
        const videoElement = isEditorVideoElement(fromElement)
          ? fromElement
          : toElement;
        const placement = videoElement.placement;
        rendererWidth = placement?.width || this.canvas.width;
        rendererHeight = placement?.height || this.canvas.height;
      } else {
        rendererWidth = this.canvas.width;
        rendererHeight = this.canvas.height;
      }

      const transitionRenderer = new GLTransitionRenderer(
        rendererWidth,
        rendererHeight
      );


      const success = await transitionRenderer.loadTransition(
        transitionType,
        fromMediaSrc,
        toMediaSrc
      );

      if (!success) {
        console.error(
          'Failed to load GL transition in setupGLTransitionRenderer'
        );
        return false;
      }


      const transitionCanvas = transitionRenderer.getCanvas();
      let transitionProperties;

      if (
        isEditorVideoElement(fromElement) ||
        isEditorVideoElement(toElement)
      ) {
        const primaryElement = isEditorVideoElement(fromElement)
          ? fromElement
          : toElement;
        const placement = primaryElement.placement;

        transitionProperties = {
          left: placement?.x || 0,
          top: placement?.y || 0,
          width: placement?.width || transitionCanvas.width,
          height: placement?.height || transitionCanvas.height,
          scaleX: placement?.scaleX || 1,
          scaleY: placement?.scaleY || 1,
          selectable: false,
          evented: false,
          opacity: 0,
          originX: 'left',
          originY: 'top',
        };
      } else {

        const fromFo = fromElement.fabricObject;
        const toFo = toElement.fabricObject;
        const fromRect = fromFo ? fromFo.getBoundingRect(true, true) : null;
        const toRect = toFo ? toFo.getBoundingRect(true, true) : null;
        if (fromRect && toRect) {
          const left = Math.min(fromRect.left, toRect.left);
          const top = Math.min(fromRect.top, toRect.top);
          transitionProperties = {
            left: left,
            top: top,
            width: transitionCanvas.width,
            height: transitionCanvas.height,
            scaleX: 1,
            scaleY: 1,
            selectable: false,
            evented: false,
            opacity: 0,
            originX: 'left',
            originY: 'top',
          };
        } else {
          const scaleX = this.canvas.width / transitionCanvas.width;
          const scaleY = this.canvas.height / transitionCanvas.height;
          transitionProperties = {
            left: 0,
            top: 0,
            scaleX: scaleX,
            scaleY: scaleY,
            selectable: false,
            evented: false,
            opacity: 0,
            originX: 'left',
            originY: 'top',
          };
        }
      }

      const transitionFabricImage = new fabric.Image(
        transitionCanvas,
        transitionProperties
      );


      this.canvas.add(transitionFabricImage);
      this.canvas.bringToFront(transitionFabricImage);
      this.ensureElementsZOrder();


      this.glTransitionElements.set(transitionId, {
        animation: this.animations.find(a => a.id === transitionId),
        fabricObject: transitionFabricImage,
        renderer: transitionRenderer,
      });

      console.log(
        `Setup GL transition renderer for ${transitionId}: fromElement=${fromElement.id}, toElement=${toElement.id}`
      );
      return true;
    } catch (error) {
      console.error('Error setting up GL transition renderer:', error);
      return false;
    }
  }

  removeGLTransition(transitionId) {
    const transitionElement = this.glTransitionElements.get(transitionId);


    const animation = this.animations.find(a => a.id === transitionId);


    if (animation) {
      const fromElement = this.editorElements.find(
        el => el.id === animation.fromElementId
      );
      const toElement = this.editorElements.find(
        el => el.id === animation.toElementId
      );


      if (fromElement && fromElement.fabricObject) {
        const currentTime = this.currentTimeInMs;
        const shouldBeVisible =
          currentTime >= fromElement.timeFrame.start &&
          currentTime <= fromElement.timeFrame.end;
        fromElement.fabricObject.set('visible', shouldBeVisible);

        if (
          isEditorVideoElement(fromElement) &&
          fromElement.glTransitionOriginalState
        ) {
          const originalState = fromElement.glTransitionOriginalState;
          if (originalState.left !== undefined) {
            fromElement.fabricObject.set({
              left: originalState.left,
              top: originalState.top,
              width: originalState.width,
              height: originalState.height,
              scaleX: originalState.scaleX,
              scaleY: originalState.scaleY,
            });
            fromElement.fabricObject.setCoords();
          }
        }
        delete fromElement.glTransitionOriginalState;
      }


      if (toElement && toElement.fabricObject) {
        const currentTime = this.currentTimeInMs;
        const shouldBeVisible =
          currentTime >= toElement.timeFrame.start &&
          currentTime <= toElement.timeFrame.end;
        toElement.fabricObject.set('visible', shouldBeVisible);

        if (
          isEditorVideoElement(toElement) &&
          toElement.glTransitionOriginalState
        ) {
          const originalState = toElement.glTransitionOriginalState;
          if (originalState.left !== undefined) {
            toElement.fabricObject.set({
              left: originalState.left,
              top: originalState.top,
              width: originalState.width,
              height: originalState.height,
              scaleX: originalState.scaleX,
              scaleY: originalState.scaleY,
            });
            toElement.fabricObject.setCoords();
          }
        }
        delete toElement.glTransitionOriginalState;
      }
    }


    if (transitionElement && transitionElement.fabricObject && this.canvas) {
      this.canvas.remove(transitionElement.fabricObject);
    }


    const animationIndex = this.animations.findIndex(
      a => a.id === transitionId
    );
    if (animationIndex !== -1) {
      this.animations.splice(animationIndex, 1);
    }


    if (typeof this.ensureElementsZOrder === 'function') {
      this.ensureElementsZOrder();
    }


    const timelineElementIndex = this.editorElements.findIndex(
      el => el.id === `animation-${transitionId}` && el.type === 'animation'
    );
    if (timelineElementIndex !== -1) {
      this.editorElements.splice(timelineElementIndex, 1);
    }


    this.glTransitionElements.delete(transitionId);

    if (this.canvas) {
      this.canvas.requestRenderAll();
    }

    if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
      window.dispatchSaveTimelineState(this);
    }
  }

  async updateGLTransition(transitionId, progress) {
    const transitionElement = this.glTransitionElements.get(transitionId);
    if (transitionElement && transitionElement.renderer) {
      try {

        const animation = this.animations.find(
          anim => anim.id === transitionId
        );

        if (!animation) {
          console.warn(`GL Transition animation not found: ${transitionId}`);
          return false;
        }

        const customParams = animation?.properties?.customParams || {};


        const fromElement = this.editorElements.find(
          el => el.id === animation.fromElementId
        );
        const toElement = this.editorElements.find(
          el => el.id === animation.toElementId
        );


        if (!fromElement || !toElement) {
          console.warn(
            `GL Transition elements not found - fromElement: ${!!fromElement}, toElement: ${!!toElement}, transitionId: ${transitionId}`
          );

          this.removeGLTransition(transitionId);
          return false;
        }

        if (!fromElement.fabricObject || !toElement.fabricObject) {
          console.warn(
            `GL Transition fabric objects not found - fromElement.fabricObject: ${!!fromElement.fabricObject}, toElement.fabricObject: ${!!toElement.fabricObject}, transitionId: ${transitionId}`
          );
          return false;
        }

        if (fromElement?.fabricObject && toElement?.fabricObject) {

          const currentFromState = {
            opacity: fromElement.fabricObject.opacity,
            scaleX: fromElement.fabricObject.scaleX,
            scaleY: fromElement.fabricObject.scaleY,
          };
          const currentToState = {
            opacity: toElement.fabricObject.opacity,
            scaleX: toElement.fabricObject.scaleX,
            scaleY: toElement.fabricObject.scaleY,
          };


          const lastFromState = transitionElement.lastFromState;
          const lastToState = transitionElement.lastToState;


          const hasOpacityAnimation = this.animations.some(
            anim =>
              (anim.targetId === animation.fromElementId ||
                anim.targetId === animation.toElementId) &&
              (anim.type === 'fadeEffect' ||
                anim.type === 'fadeIn' ||
                anim.type === 'fadeOut')
          );

          const opacityThreshold = hasOpacityAnimation ? 0.001 : 0.002;
          const scaleThreshold = 0.005;

          let shouldUpdateTextures =
            !lastFromState ||
            !lastToState ||
            Math.abs(currentFromState.opacity - lastFromState.opacity) >
              opacityThreshold ||
            Math.abs(currentFromState.scaleX - lastFromState.scaleX) >
              scaleThreshold ||
            Math.abs(currentFromState.scaleY - lastFromState.scaleY) >
              scaleThreshold ||
            Math.abs(currentToState.opacity - lastToState.opacity) >
              opacityThreshold ||
            Math.abs(currentToState.scaleX - lastToState.scaleX) >
              scaleThreshold ||
            Math.abs(currentToState.scaleY - lastToState.scaleY) >
              scaleThreshold;

          if (shouldUpdateTextures) {

            const hasOpacityChange =
              Math.abs(
                currentFromState.opacity - (lastFromState?.opacity || 1)
              ) > 0.01 ||
              Math.abs(currentToState.opacity - (lastToState?.opacity || 1)) >
                0.01;
            if (hasOpacityChange) {
            }



            const fromCanvas = captureFabricObjectState(
              fromElement.fabricObject,
              fromElement.fabricObject.width * fromElement.fabricObject.scaleX,
              fromElement.fabricObject.height * fromElement.fabricObject.scaleY
            );
            const toCanvas = captureFabricObjectState(
              toElement.fabricObject,
              toElement.fabricObject.width * toElement.fabricObject.scaleX,
              toElement.fabricObject.height * toElement.fabricObject.scaleY
            );

            if (fromCanvas && toCanvas) {
              try {

                const texturesUpdated =
                  await transitionElement.renderer.updateTextures(
                    fromCanvas,
                    toCanvas
                  );

                if (texturesUpdated) {

                  transitionElement.lastFromState = { ...currentFromState };
                  transitionElement.lastToState = { ...currentToState };
                } else {
                  console.warn(
                    'Failed to update GL transition textures - continuing with original textures'
                  );
                }
              } catch (error) {
                console.error('Error updating GL transition textures:', error);

              }
            } else {
              console.warn(
                'Failed to capture fabric object states - using original textures'
              );
            }
          }
        } else {
          console.warn(
            'GL Transition: fabric objects not available - using original textures'
          );
        }


        try {
          transitionElement.renderer.render(progress, customParams);
        } catch (e) {

          console.warn('Renderer render failed, will attempt lazy recreate', e);
        }


        transitionElement.fabricObject.setElement(
          transitionElement.renderer.getCanvas()
        );


        return true;
      } catch (error) {
        console.error('Error in updateGLTransition:', transitionId, error);
        return false;
      }
    }
    return false;
  }


  updateGLTransitionProperties(transitionId, properties) {

    const transitionElement = this.glTransitionElements.get(transitionId);
    if (transitionElement) {
      transitionElement.lastFromState = null;
      transitionElement.lastToState = null;
    }
    const animationIndex = this.animations.findIndex(
      anim => anim.id === transitionId
    );
    if (animationIndex !== -1) {
      const animation = this.animations[animationIndex];


      animation.manuallyAdjusted = true;


      animation.properties = {
        ...animation.properties,
        ...properties,
      };


      const transitionElement = this.glTransitionElements.get(transitionId);
      if (transitionElement) {

        transitionElement.animation = animation;
      }


      this.scheduleAnimationRefresh();


      const isActive =
        this.currentTimeInMs >= animation.startTime &&
        this.currentTimeInMs <= animation.endTime;
      if (isActive) {
        const progress =
          (this.currentTimeInMs - animation.startTime) /
          (animation.endTime - animation.startTime);
        this.updateGLTransition(transitionId, progress).catch(error => {
          console.error('Error updating GL transition properties:', error);
        });
        this.canvas.requestRenderAll();
      }


      if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
        window.dispatchSaveTimelineState(this);
      }

      return true;
    }
    return false;
  }

  ensureElementsZOrder() {
    if (!this.canvas) return;


    const elementsWithZOrder = [];

    this.editorElements.forEach(element => {
      if (
        !element.fabricObject ||
        !this.canvas.contains(element.fabricObject)
      ) {
        return;
      }


      const isPartOfActiveTransition = Array.from(
        this.glTransitionElements.values()
      ).some(transitionElement => {
        const transitionId = transitionElement.animation?.id;
        if (!transitionId) return false;
        const animation = this.animations.find(
          anim => anim.id === transitionId
        );
        if (!animation || animation.type !== 'glTransition') {
          return false;
        }
        const isTransitionActive =
          this.currentTimeInMs >= animation.startTime &&
          this.currentTimeInMs <= animation.endTime;
        return (
          isTransitionActive &&
          (animation.fromElementId === element.id ||
            animation.toElementId === element.id)
        );
      });

      if (isPartOfActiveTransition) {
        return;
      }


      const fabricObjects = [];


      fabricObjects.push({
        obj: element.fabricObject,
        row: element.row,
        isSubtitle: element.type === 'text' && element.subType === 'subtitles',
        isBackground: false,
        element: element,
      });


      if (
        element.type === 'text' &&
        element.subType === 'subtitles' &&
        element.properties.wordObjects
      ) {
        element.properties.wordObjects.forEach(wordObj => {
          if (wordObj && this.canvas.contains(wordObj)) {
            fabricObjects.push({
              obj: wordObj,
              row: element.row,
              isSubtitle: true,
              isBackground: false,
              element: element,
            });
          }
        });
      }


      if (
        element.type === 'text' &&
        element.subType === 'subtitles' &&
        element.backgroundObject &&
        this.canvas.contains(element.backgroundObject)
      ) {
        fabricObjects.push({
          obj: element.backgroundObject,
          row: element.row,
          isSubtitle: true,
          isBackground: true,
          element: element,
        });
      }

      elementsWithZOrder.push(...fabricObjects);
    });


    const glTransitionsWithZOrder = [];
    Array.from(this.glTransitionElements.entries()).forEach(
      ([transitionId, transitionElement]) => {
        if (
          transitionElement.fabricObject &&
          this.canvas.contains(transitionElement.fabricObject)
        ) {
          const animation = this.animations.find(
            anim => anim.id === transitionId
          );
          if (animation && animation.type === 'glTransition') {
            glTransitionsWithZOrder.push({
              obj: transitionElement.fabricObject,
              row: animation.row || 0,
              isGLTransition: true,
              transitionId: transitionId,
              startTime: animation.startTime,
              endTime: animation.endTime,
              animation: animation,
            });
          }
        }
      }
    );


    glTransitionsWithZOrder.sort((a, b) => {

      if (a.row !== b.row) {
        return b.row - a.row
      }

      return b.startTime - a.startTime;
    });


    elementsWithZOrder.sort((a, b) => {

      if (a.row !== b.row) {
        return b.row - a.row
      }


      if (a.isBackground !== b.isBackground) {
        return a.isBackground ? -1 : 1
      }


      if (a.isSubtitle !== b.isSubtitle) {
        return a.isSubtitle ? 1 : -1
      }

      return 0;
    });


    elementsWithZOrder.forEach(item => {
      if (item.obj && this.canvas.contains(item.obj)) {
        this.canvas.bringToFront(item.obj);
      }
    });


    glTransitionsWithZOrder.forEach(item => {
      if (item.obj && this.canvas.contains(item.obj)) {
        this.canvas.bringToFront(item.obj);
      }
    });
  }

  ensureSubtitlesOnTop() {

    this.ensureElementsZOrder();
  }

  synchronizeGLTransitionState(transitionId) {
    const transitionElement = this.glTransitionElements.get(transitionId);
    if (!transitionElement) {
      console.warn(
        'GL transition element not found for synchronization:',
        transitionId
      );
      return;
    }

    const animation = this.animations.find(anim => anim.id === transitionId);
    if (!animation || animation.type !== 'glTransition') {
      console.warn(
        'GL transition animation not found for synchronization:',
        transitionId
      );
      return;
    }


    if (transitionElement.fabricObject && this.canvas) {

      const wasOnCanvas = this.canvas.contains(transitionElement.fabricObject);
      if (wasOnCanvas) {
        this.canvas.remove(transitionElement.fabricObject);
      }


      this.canvas.add(transitionElement.fabricObject);
      this.canvas.bringToFront(transitionElement.fabricObject);


      this.ensureElementsZOrder();
    }


    const fromElement = this.editorElements.find(
      el => el.id === animation.fromElementId
    );
    const toElement = this.editorElements.find(
      el => el.id === animation.toElementId
    );


    if (!fromElement || !toElement) {
      console.warn(
        `GL Transition sync: elements not found - fromElement: ${!!fromElement}, toElement: ${!!toElement}, transitionId: ${transitionId}`
      );

      this.removeGLTransition(transitionId);
      return;
    }


    if (
      fromElement &&
      fromElement.fabricObject &&
      !fromElement.glTransitionOriginalState
    ) {
      fromElement.glTransitionOriginalState = {
        visible: fromElement.fabricObject.visible,
        opacity: fromElement.fabricObject.opacity,

        ...(isEditorVideoElement(fromElement)
          ? {
              left: fromElement.fabricObject.left,
              top: fromElement.fabricObject.top,
              width: fromElement.fabricObject.width,
              height: fromElement.fabricObject.height,
              scaleX: fromElement.fabricObject.scaleX,
              scaleY: fromElement.fabricObject.scaleY,
            }
          : {}),
      };
    }
    if (
      toElement &&
      toElement.fabricObject &&
      !toElement.glTransitionOriginalState
    ) {
      toElement.glTransitionOriginalState = {
        visible: toElement.fabricObject.visible,
        opacity: toElement.fabricObject.opacity,

        ...(isEditorVideoElement(toElement)
          ? {
              left: toElement.fabricObject.left,
              top: toElement.fabricObject.top,
              width: toElement.fabricObject.width,
              height: toElement.fabricObject.height,
              scaleX: toElement.fabricObject.scaleX,
              scaleY: toElement.fabricObject.scaleY,
            }
          : {}),
      };
    }


    const currentTime = this.currentTimeInMs;
    const isActive =
      currentTime >= animation.startTime && currentTime <= animation.endTime;

    if (isActive) {
      const progress =
        (currentTime - animation.startTime) /
        (animation.endTime - animation.startTime);
      const clampedProgress = Math.max(0, Math.min(1, progress));


      this.updateGLTransition(transitionId, clampedProgress).catch(error => {
        console.error(
          'Error updating GL transition during synchronization:',
          error
        );
      });
      transitionElement.fabricObject.set('opacity', 1);


      if (fromElement && fromElement.fabricObject) {

        fromElement.fabricObject.set('visible', false);
      }

      if (toElement && toElement.fabricObject) {

        toElement.fabricObject.set('visible', false);
      }
    } else {

      transitionElement.fabricObject.set('opacity', 0);


      if (fromElement && fromElement.fabricObject) {
        const shouldBeVisible = this.shouldElementBeVisibleWithGLTransitions(
          fromElement.id,
          currentTime
        );
        console.log(
          `GL Transition sync (inactive) - fromElement ${fromElement.id}: shouldBeVisible=${shouldBeVisible}`
        );
        fromElement.fabricObject.set('visible', shouldBeVisible);


        if (
          isEditorVideoElement(fromElement) &&
          fromElement.glTransitionOriginalState
        ) {
          const originalState = fromElement.glTransitionOriginalState;
          if (originalState.left !== undefined) {
            fromElement.fabricObject.set({
              left: originalState.left,
              top: originalState.top,
              width: originalState.width,
              height: originalState.height,
              scaleX: originalState.scaleX,
              scaleY: originalState.scaleY,
            });
            fromElement.fabricObject.setCoords();
          }
        }
      }
      if (toElement && toElement.fabricObject) {
        const shouldBeVisible = this.shouldElementBeVisibleWithGLTransitions(
          toElement.id,
          currentTime
        );
        console.log(
          `GL Transition sync (inactive) - toElement ${toElement.id}: shouldBeVisible=${shouldBeVisible}`
        );
        toElement.fabricObject.set('visible', shouldBeVisible);


        if (
          isEditorVideoElement(toElement) &&
          toElement.glTransitionOriginalState
        ) {
          const originalState = toElement.glTransitionOriginalState;
          if (originalState.left !== undefined) {
            toElement.fabricObject.set({
              left: originalState.left,
              top: originalState.top,
              width: originalState.width,
              height: originalState.height,
              scaleX: originalState.scaleX,
              scaleY: originalState.scaleY,
            });
            toElement.fabricObject.setCoords();
          }
        }
      }
    }


    this.manageGLTransitionConflicts(currentTime);


    this.canvas.requestRenderAll();
  }

  updateGLTransitionTiming(transitionId, { startTime, endTime, duration }) {

    const glTransition = this.glTransitionElements.get(transitionId);
    if (glTransition) {
      glTransition.lastFromState = null;
      glTransition.lastToState = null;
    }

    const transitionIndex = this.animations.findIndex(
      anim => anim.id === transitionId
    );
    if (transitionIndex === -1) return;

    const transition = this.animations[transitionIndex];


    transition.manuallyAdjusted = true;


    if (startTime !== undefined) {
      transition.startTime = startTime;
      if (transition.properties) {
        transition.properties.startTime = startTime;
      }
    }

    if (endTime !== undefined) {
      transition.endTime = endTime;
      if (transition.properties) {
        transition.properties.endTime = endTime;
      }
    }

    if (duration !== undefined) {
      transition.duration = duration;
      if (transition.properties) {
        transition.properties.duration = duration;
      }
    }


    const glTransitionElement = this.glTransitionElements.get(transitionId);
    if (glTransitionElement) {
      glTransitionElement.startTime = startTime || transition.startTime;
      glTransitionElement.endTime = endTime || transition.endTime;
      glTransitionElement.duration = duration || transition.duration;


      glTransitionElement.animation = transition;
    }
  }

  updateEffect(id, effect) {
    const index = this.editorElements.findIndex(element => element.id === id);
    const element = this.editorElements[index];
    if (isEditorVideoElement(element) || isEditorImageElement(element)) {
      element.properties.effect = effect;
    }
    this.refreshElements();
  }

  setVideos(videos) {
    this.videos = videos;
  }

  updateAllMediaPlaybackRates() {

    this.videos.forEach(video => {
      if (video.element) {
        video.element.playbackRate = this.playbackRate;
      }
    });


    this.audios.forEach(audio => {
      if (audio.element) {
        audio.element.playbackRate = this.playbackRate;
      }
    });
  }

  updateAllMediaPlaybackRates() {

    this.videos.forEach(video => {
      if (video.element) {
        video.element.playbackRate = this.playbackRate;
      }
    });


    this.audios.forEach(audio => {
      if (audio.element) {
        audio.element.playbackRate = this.playbackRate;
      }
    });
  }

  setSubtitlesAnimation(animation) {
    this.subtitlesAnimation = animation;
  }

  addVideoResource(video) {

    if (!video.element) {
      video.element = document.createElement('video');
      video.element.src = video.src;
      video.element.preload = 'auto';
    }


    video.element.playbackRate = this.playbackRate;


    this.videos = [...this.videos, video];
  }

  addAudioResource(audio) {

    if (!audio.element) {
      audio.element = document.createElement('audio');
    }


    audio.element.playbackRate = this.playbackRate;


    this.audios = [...this.audios, audio];
  }

  addImageResource(image) {
    this.images = [...this.images, image];
  }

  checkOverlapAndAdjust = (currentId, newStartTime, newEndTime, newRow) => {
    let adjustedStartTime = newStartTime;
    let adjustedRow = newRow;
    const newDuration = newEndTime - newStartTime;

    const sortedOverlays = [...this.editorElements].sort(
      (a, b) => a.startTime - b.startTime
    );

    for (let row = adjustedRow; row < this.maxRows; row++) {
      const overlaysInRow = sortedOverlays
        .filter(overlay => overlay.id !== currentId && overlay.row === row)
        .sort((a, b) => a.startTime - b.startTime);

      const availableSpaces = [];

      if (overlaysInRow.length === 0 || overlaysInRow[0].startTime > 0) {
        availableSpaces.push({
          start: 0,
          end: overlaysInRow.length ? overlaysInRow[0].startTime : this.maxTime,
        });
      }

      for (let i = 0; i < overlaysInRow.length; i++) {
        const currentOverlay = overlaysInRow[i];
        const nextOverlay = overlaysInRow[i + 1];
        const currentEnd = currentOverlay.endTime;

        if (nextOverlay) {
          if (nextOverlay.startTime > currentEnd) {
            availableSpaces.push({
              start: currentEnd,
              end: nextOverlay.startTime,
            });
          }
        } else {
          if (currentEnd < this.maxTime) {
            availableSpaces.push({
              start: currentEnd,
              end: this.maxTime,
            });
          }
        }
      }

      const bestSpace = availableSpaces.find(
        space =>
          space.end - space.start >= newDuration &&
          adjustedStartTime >= space.start &&
          adjustedStartTime <= space.end - newDuration
      );

      if (bestSpace) {
        adjustedStartTime = Math.max(
          bestSpace.start,
          Math.min(adjustedStartTime, bestSpace.end - newDuration)
        );
        return { startTime: adjustedStartTime, row };
      }

      adjustedRow = row + 1;
    }

    const lastRow = this.maxRows - 1;
    const lastOverlayInLastRow = sortedOverlays
      .filter(overlay => overlay.row === lastRow && overlay.id !== currentId)
      .reduce((latest, overlay) => Math.max(latest, overlay.endTime), 0);

    adjustedStartTime = Math.max(lastOverlayInLastRow, 0);
    adjustedStartTime = Math.min(adjustedStartTime, this.maxTime - newDuration);

    return { startTime: adjustedStartTime, row: lastRow };
  };

  moveImageResource(from, to) {
    const fromIndex = this.editorElements.findIndex(
      element => element.id === from.id
    );
    const toIndex = this.editorElements.findIndex(
      element => element.id === to.id
    );

    if (fromIndex === -1 || toIndex === -1) {
      console.error('Invalid IDs provided for moving elements.');
      return;
    }

    const updatedElements = [...this.editorElements];
    const [movedElement] = updatedElements.splice(fromIndex, 1);
    updatedElements.splice(toIndex, 0, movedElement);

    const tempTimeFrame = updatedElements[fromIndex].timeFrame;
    updatedElements[fromIndex].timeFrame = updatedElements[toIndex].timeFrame;
    updatedElements[toIndex].timeFrame = tempTimeFrame;

    this.editorElements = updatedElements;
    this.refreshElements();
  }

  addAnimation(animation) {

    let effectType;
    if (animation.type.toLowerCase().includes('effect')) {
      effectType = 'dolly';
    } else {
      effectType = animation.type.toLowerCase().includes('in') ? 'in' : 'out';
    }


    let targetIds = [];
    let targetElement = null;

    if (animation.targetId) {

      targetIds = [animation.targetId];
      targetElement = this.editorElements.find(
        element => element.id === animation.targetId
      );
    } else if (animation.targetIds && animation.targetIds.length > 0) {

      targetIds = animation.targetIds;

      targetElement = this.editorElements.find(element =>
        targetIds.includes(element.id)
      );
    } else {


      targetIds = [];
    }


    const newAnimation = {
      ...animation,
      targetIds: targetIds,
      targetId: undefined,
      effect: effectType,
      syncToAllScenes: animation.syncToAllScenes ?? true,
    };

    this.animations = [...this.animations, newAnimation];



    if (!this.isInitializing && !animation.type.startsWith('textWord')) {

      if (targetElement) {
        this.createTimelineElementForAnimation(newAnimation, targetElement);
      } else {

        this.createTimelineElementForAnimationWithoutTarget(newAnimation);
      }
    }

    this.scheduleAnimationRefresh();


    if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
      window.dispatchSaveTimelineState(this);
    }

    return true
  }


  createTimelineElementForAnimationWithoutTarget(animation) {
    const properties = animation.properties || {};
    let startTime = properties.absoluteStart || properties.startTime || 0;
    let endTime =
      properties.absoluteEnd ||
      properties.endTime ||
      animation.duration ||
      1000;


    let animationRow =
      animation.row !== undefined
        ? animation.row
        : this.findAvailableAnimationRow();

    const animationElement = {
      id: `animation-${animation.id}`,
      animationId: animation.id,
      type: 'animation',
      targetId: null,
      targetIds: [],
      row: animationRow,
      timeFrame: {
        start: startTime,
        end: endTime,
      },
      name: `Animation ${animation.type}`,
      placement: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      properties: {
        animationType: animation.type,
        effect: animation.effect,
        ...animation.properties,
      },
    };


    this.editorElements = [...this.editorElements, animationElement];


    this.updateAnimationTargets(animation.id, animationRow);


    this.scheduleAnimationRefresh();
    if (this.canvas) {
      this.canvas.requestRenderAll();
    }
  }


  createTimelineElementForAnimation(animation, targetElement) {
    const properties = animation.properties || {};
    let startTime = properties.startTime || 0;
    let endTime = properties.endTime || animation.duration || 1000;


    if (animation.type.endsWith('Out') && startTime === 0) {
      const elementDuration =
        targetElement.timeFrame.end - targetElement.timeFrame.start;
      const animationDuration = endTime - startTime;
      startTime = Math.max(0, elementDuration - animationDuration);
      endTime = startTime + animationDuration;
    }


    const absoluteStart = targetElement.timeFrame.start + startTime;
    const absoluteEnd = Math.min(
      targetElement.timeFrame.start + endTime,
      targetElement.timeFrame.end
    );


    let effectDirection = 'in';
    if (animation.type === 'zoomEffect') {
      const initialScale =
        properties.scaleFactor || properties.initialScale || 1.0;
      const targetScale = properties.targetScale || properties.endScale || 2.0;
      effectDirection = initialScale < targetScale ? 'in' : 'out';
    } else if (animation.type === 'fadeEffect') {
      const initialOpacity =
        properties.opacity || properties.initialOpacity || 1.0;
      const targetOpacity =
        properties.targetOpacity || properties.endOpacity || 0.0;
      effectDirection = initialOpacity < targetOpacity ? 'in' : 'out';
    } else if (animation.type.endsWith('In')) {
      effectDirection = 'in';
    } else if (animation.type.endsWith('Out')) {
      effectDirection = 'out';
    } else {
      effectDirection = animation.effectVariant || 'in';
    }


    let targetRow =
      animation.row !== undefined
        ? animation.row
        : Math.max(0, targetElement.row - 1);
    const timeFrame = { start: absoluteStart, end: absoluteEnd };


    if (animation.row !== undefined) {
      const animationElement = {
        id: `animation-${animation.id}`,
        animationId: animation.id,
        type: 'animation',
        targetId: animation.targetId,
        targetIds:
          animation.targetIds ||
          (animation.targetId ? [animation.targetId] : []),
        row: targetRow,
        timeFrame: {
          start: absoluteStart,
          end: absoluteEnd,
        },
        properties: {
          animationType: animation.type,
          displayName: `${animation.type} Animation`,
          originalAnimation: animation,
          effectDirection: effectDirection,
        },
        absoluteStart,
        absoluteEnd,
        effect: effectDirection,
      };


      this.editorElements.push(animationElement);


      if (targetRow >= this.maxRows) {
        this.setMaxRows(targetRow + 1);
      }

      return
    }


    while (true) {
      const rowElements = this.getElementsInRow(targetRow);
      const hasOverlap = rowElements.some(
        el =>
          el.timeFrame.start < timeFrame.end &&
          el.timeFrame.end > timeFrame.start
      );

      if (!hasOverlap) {

        const animationElement = {
          id: `animation-${animation.id}`,
          animationId: animation.id,
          type: 'animation',
          targetId: animation.targetId,
          targetIds:
            animation.targetIds ||
            (animation.targetId ? [animation.targetId] : []),
          row: targetRow,
          timeFrame: {
            start: absoluteStart,
            end: absoluteEnd,
          },
          properties: {
            animationType: animation.type,
            displayName: `${animation.type} Animation`,
            originalAnimation: animation,
            effectDirection: effectDirection,
          },
          absoluteStart,
          absoluteEnd,
          effect: effectDirection,
        };


        this.editorElements.push(animationElement);


        if (targetRow >= this.maxRows) {
          this.setMaxRows(targetRow + 1);
        }

        break;
      }


      if (targetRow === 0) {
        this.shiftRowsDown(0);


        const animationElement = {
          id: `animation-${animation.id}`,
          animationId: animation.id,
          type: 'animation',
          targetId: animation.targetId,
          targetIds:
            animation.targetIds ||
            (animation.targetId ? [animation.targetId] : []),
          row: 0,
          timeFrame: {
            start: absoluteStart,
            end: absoluteEnd,
          },
          properties: {
            animationType: animation.type,
            displayName: `${animation.type} Animation`,
            originalAnimation: animation,
            effectDirection: effectDirection,
          },
          absoluteStart,
          absoluteEnd,
          effect: effectDirection,
        };


        this.editorElements.push(animationElement);
        break;
      }


      targetRow = Math.max(0, targetRow - 1);
    }
  }


  createTimelineElementsForStoredAnimations(animationIds = null) {

    const animationsToProcess = animationIds
      ? this.animations.filter(animation => animationIds.includes(animation.id))
      : this.animations;

    animationsToProcess.forEach(animation => {

      const existingTimelineElement = this.editorElements.find(
        el => el.type === 'animation' && el.animationId === animation.id
      );

      if (!existingTimelineElement) {
        if (animation.type === 'glTransition') {

          const fromElement = this.editorElements.find(
            el => el.id === animation.fromElementId && el.type !== 'animation'
          );
          const toElement = this.editorElements.find(
            el => el.id === animation.toElementId && el.type !== 'animation'
          );

          if (fromElement && toElement) {

            const animationRow =
              animation.row !== undefined
                ? animation.row
                : this.findAvailableRowForGLTransition(fromElement, toElement);

            const timelineElement = {
              id: `animation-${animation.id}`,
              animationId: animation.id,
              type: 'animation',
              targetId: animation.fromElementId,
              fromElementId: animation.fromElementId,
              toElementId: animation.toElementId,
              targetIds: animation.targetIds || [
                animation.fromElementId,
                animation.toElementId,
              ],
              row: animationRow,
              timeFrame: {
                start: animation.startTime,
                end: animation.endTime,
              },
              properties: {
                animationType: 'glTransition',
                transitionType: animation.transitionType,
                displayName: `${animation.transitionType} Transition`,
                originalAnimation: animation,
                effectDirection: 'transition',
              },

              absoluteStart: animation.startTime,
              absoluteEnd: animation.endTime,
              effectDirection: 'transition',
              displayName: `${animation.transitionType} Transition`,
            };


            runInAction(() => {
              this.editorElements.push(timelineElement);
            });


            if (animationRow >= this.maxRows) {
              this.setMaxRows(animationRow + 1);
            }
          }
        } else {

          const targetElement = this.editorElements.find(
            el => el.id === animation.targetId && el.type !== 'animation'
          );

          if (targetElement) {
            this.createTimelineElementForAnimation(animation, targetElement);
          }
        }
      }
    });
  }

  updateTimelineElementForAnimation(animation) {

    const timelineElement = this.editorElements.find(
      el =>
        (el.type === 'animation' || el.type === 'transition') &&
        el.animationId === animation.id
    );

    if (!timelineElement) {
      return;
    }

    const properties = animation.properties || {};
    let startTime = properties.startTime || 0;
    let endTime = properties.endTime || animation.duration || 1000;


    const targetIds =
      Array.isArray(animation.targetIds) && animation.targetIds.length > 0
        ? animation.targetIds
        : animation.targetId
        ? [animation.targetId]
        : [];

    const targetElements = this.editorElements.filter(
      el => targetIds.includes(el.id) && el.type !== 'animation'
    );

    if (targetElements.length === 0) {

      const legacyTarget = this.editorElements.find(
        el => el.id === animation.targetId && el.type !== 'animation'
      );
      if (!legacyTarget) return;


      if (animation.type.endsWith('Out') && startTime === 0) {
        const elementDuration =
          legacyTarget.timeFrame.end - legacyTarget.timeFrame.start;
        const animationDuration = endTime - startTime;
        startTime = Math.max(0, elementDuration - animationDuration);
        endTime = startTime + animationDuration;
      }

      const absoluteStart = legacyTarget.timeFrame.start + startTime;
      const absoluteEnd = Math.min(
        legacyTarget.timeFrame.start + endTime,
        legacyTarget.timeFrame.end
      );

      timelineElement.timeFrame = { start: absoluteStart, end: absoluteEnd };
      timelineElement.absoluteStart = absoluteStart;
      timelineElement.absoluteEnd = absoluteEnd;
      if (timelineElement.properties) {
        timelineElement.properties.originalAnimation = animation;
      }
      return;
    }


    let selectedTarget = null;
    if (targetElements.length === 1) {
      selectedTarget = targetElements[0];
    } else if (targetElements.length > 1) {

      const prevStart =
        timelineElement.timeFrame?.start ?? timelineElement.absoluteStart ?? 0;
      const prevEnd =
        timelineElement.timeFrame?.end ??
        timelineElement.absoluteEnd ??
        prevStart + (endTime - startTime);
      let best = null;
      let bestOverlap = -1;
      targetElements.forEach(el => {
        const overlapStart = Math.max(prevStart, el.timeFrame.start);
        const overlapEnd = Math.min(prevEnd, el.timeFrame.end);
        const overlap = Math.max(0, overlapEnd - overlapStart);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = el;
        }
      });

      if (!best) {
        best = targetElements.reduce((acc, el) => {
          const accDist = Math.abs((acc?.timeFrame.start ?? 0) - prevStart);
          const elDist = Math.abs(el.timeFrame.start - prevStart);
          return elDist < accDist ? el : acc;
        }, targetElements[0]);
      }
      selectedTarget = best;
    }

    if (!selectedTarget) {

      let absoluteStarts = [];
      let absoluteEnds = [];
      targetElements.forEach(targetEl => {
        let localStart = startTime;
        let localEnd = endTime;
        if (animation.type.endsWith('Out') && localStart === 0) {
          const elementDuration =
            targetEl.timeFrame.end - targetEl.timeFrame.start;
          const animationDuration = localEnd - localStart;
          localStart = Math.max(0, elementDuration - animationDuration);
          localEnd = localStart + animationDuration;
        }
        const absStart = targetEl.timeFrame.start + localStart;
        const absEnd = Math.min(
          targetEl.timeFrame.start + localEnd,
          targetEl.timeFrame.end
        );
        absoluteStarts.push(absStart);
        absoluteEnds.push(absEnd);
      });
      const absoluteStart = Math.min(...absoluteStarts);
      const absoluteEnd = Math.max(...absoluteEnds);
      timelineElement.timeFrame = { start: absoluteStart, end: absoluteEnd };
      timelineElement.absoluteStart = absoluteStart;
      timelineElement.absoluteEnd = absoluteEnd;
      if (timelineElement.properties) {
        timelineElement.properties.originalAnimation = animation;
      }
      return;
    }


    const elementStart = selectedTarget.timeFrame.start;
    const elementEnd = selectedTarget.timeFrame.end;
    const elementDuration = elementEnd - elementStart;

    const prevAbsStart = timelineElement.timeFrame?.start ?? null;
    const prevAbsEnd = timelineElement.timeFrame?.end ?? null;
    const epsilon = 2

    const requestedDuration = Math.max(
      100,
      endTime - startTime || animation.duration || 1000
    );

    let localStart = startTime;
    let localEnd = startTime + requestedDuration;

    const anchoredToEnd =
      prevAbsEnd != null && Math.abs(prevAbsEnd - elementEnd) <= epsilon;
    const anchoredToStart =
      prevAbsStart != null && Math.abs(prevAbsStart - elementStart) <= epsilon;

    if (animation.type.endsWith('Out') && (localStart === 0 || anchoredToEnd)) {

      localEnd = elementDuration;
      localStart = Math.max(0, localEnd - requestedDuration);
    } else if (animation.type.endsWith('In') && anchoredToEnd) {

      localEnd = elementDuration;
      localStart = Math.max(0, localEnd - requestedDuration);
    } else if (anchoredToStart) {

      localStart = 0;
      localEnd = Math.min(elementDuration, requestedDuration);
    } else if (prevAbsStart != null) {

      const prevLocalStart = Math.max(0, prevAbsStart - elementStart);
      localStart = Math.min(prevLocalStart, Math.max(0, elementDuration - 100));
      localEnd = Math.min(elementDuration, localStart + requestedDuration);
    }


    if (localEnd - localStart < 100) {
      localEnd = Math.min(elementDuration, localStart + 100);
      localStart = Math.max(0, localEnd - 100);
    }

    const absoluteStart = elementStart + localStart;
    const absoluteEnd = elementStart + localEnd;

    timelineElement.timeFrame = { start: absoluteStart, end: absoluteEnd };
    timelineElement.absoluteStart = absoluteStart;
    timelineElement.absoluteEnd = absoluteEnd;
    timelineElement.targetId = selectedTarget.id;
    timelineElement.targetIds = [selectedTarget.id];
    if (timelineElement.properties) {
      timelineElement.properties.originalAnimation = animation;
    }


    const animIndex = this.animations.findIndex(a => a.id === animation.id);
    if (animIndex !== -1) {
      const updated = {
        ...this.animations[animIndex],
        properties: {
          ...this.animations[animIndex].properties,
          startTime: localStart,
          endTime: localEnd,
        },
        duration: localEnd - localStart,
        targetIds: [selectedTarget.id],
      };
      this.animations[animIndex] = updated;
    }
  }

  addAnimationElement({
    targetId,
    targetIds,
    id,
    type,
    effect,
    timeFrame,
    row,
  }) {
    const hasElementsInFirstRow = this.editorElements.some(
      element => element.row === row && element.type !== 'transition'
    );


    if (hasElementsInFirstRow) {
      this.shiftRowsDown(row);
    }

    const newElement = {
      id,
      name: `Animation ${type}`,
      type: 'transition',
      targetId,
      targetIds: targetIds || (targetId ? [targetId] : []),
      effect,
      placement: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      timeFrame: { ...timeFrame },
      row,
      properties: {
        animationType: type,
        effect,
      },
    };


    this.editorElements = [...this.editorElements, newElement];
    this.refreshElements();
  }

  removeAnimationElement({ targetId }) {

    const index = this.animations.findIndex(
      a =>
        a.targetId === targetId ||
        (a.targetIds && a.targetIds.includes(targetId))
    );

    if (index !== -1) {

      this.clearGLTransitionCache();

      this.animations.splice(index, 1);
      this.scheduleAnimationRefresh();
    }
  }

  updateAnimation(id, animation) {

    this.clearGLTransitionCache();

    const index = this.animations.findIndex(a => a.id === id);

    const effectType = animation.type.toLowerCase().includes('in')
      ? 'in'
      : 'out';
    this.animations[index] = { ...animation, effect: effectType };
    this.scheduleAnimationRefresh();


    this.updateTimelineElementForAnimation(animation);





    if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
      window.dispatchSaveTimelineState(this);
    }
  }

  scheduleAnimationRefresh() {
    if (this.animationUpdateTimeout) {
      clearTimeout(this.animationUpdateTimeout);
    }

    this.animationUpdateTimeout = setTimeout(() => {
      if (!this.isRefreshingAnimations) {
        this.refreshAnimations();
      }
    }, this.ANIMATION_BATCH_DELAY);
  }


  getAnimationStartTime(animation, editorElement, startTime) {

    const animationElement = this.editorElements.find(
      el => el.type === 'animation' && el.animationId === animation.id
    );

    if (animationElement && animationElement.timeFrame) {

      return animationElement.timeFrame.start;
    } else {

      const elementStart = editorElement.timeFrame.start;
      return elementStart + startTime;
    }
  }


  getAnimationEndTime(animation, editorElement, endTime) {

    const animationElement = this.editorElements.find(
      el => el.type === 'animation' && el.animationId === animation.id
    );

    if (animationElement && animationElement.timeFrame) {

      return animationElement.timeFrame.end;
    } else {

      const elementStart = editorElement.timeFrame.start;
      return elementStart + endTime;
    }
  }


  getEasingFromAnimation(animation, defaultEasing = 'linear') {
    try {
      const curveData = animation.properties?.curveData;
      if (curveData && Array.isArray(curveData) && curveData.length >= 2) {

        return convertCurveToEasing(curveData, 'anime');
      }
      return defaultEasing;
    } catch (error) {
      console.warn('Error converting curve to easing:', error);
      return defaultEasing;
    }
  }


  clearGLTransitionCache() {
    this.glTransitionElements.forEach((transitionElement, transitionId) => {
      if (transitionElement.lastFromState || transitionElement.lastToState) {
        transitionElement.lastFromState = null;
        transitionElement.lastToState = null;
      }
    });
  }

  resetAnimationState(editorElement) {
    if (editorElement.fabricObject) {
      const fabricObject = editorElement.fabricObject;


      const isPartOfActiveGLTransition = Array.from(
        this.glTransitionElements.values()
      ).some(transitionElement => {
        const animation = this.animations.find(
          anim => anim.id === transitionElement.animation?.id
        );
        if (!animation || animation.type !== 'glTransition') {
          return false;
        }
        const currentTime = this.currentTimeInMs;
        const isTransitionActive =
          currentTime >= animation.startTime &&
          currentTime <= animation.endTime;
        return (
          isTransitionActive &&
          (animation.fromElementId === editorElement.id ||
            animation.toElementId === editorElement.id)
        );
      });



      const currentVisibility = fabricObject.visible;
      const currentOpacity = fabricObject.opacity;


      if (!editorElement.initialState) {

        const placement = editorElement.placement || {};
        editorElement.initialState = {
          scaleX: placement.scaleX || fabricObject.scaleX,
          scaleY: placement.scaleY || fabricObject.scaleY,
          left: placement.x || fabricObject.left,
          top: placement.y || fabricObject.top,
          opacity: fabricObject.opacity || 1.0,
        };
      } else {

        const placement = editorElement.placement || {};
        if (
          placement.x !== undefined &&
          placement.y !== undefined &&
          (Math.abs(editorElement.initialState.left - placement.x) > 1 ||
            Math.abs(editorElement.initialState.top - placement.y) > 1)
        ) {

          editorElement.initialState.left = placement.x;
          editorElement.initialState.top = placement.y;
          if (placement.scaleX !== undefined)
            editorElement.initialState.scaleX = placement.scaleX;
          if (placement.scaleY !== undefined)
            editorElement.initialState.scaleY = placement.scaleY;
        }
      }

      fabricObject.set({
        scaleX: editorElement.initialState.scaleX,
        scaleY: editorElement.initialState.scaleY,
        left: editorElement.initialState.left,
        top: editorElement.initialState.top,
        opacity: isPartOfActiveGLTransition
          ? currentOpacity
          : editorElement.initialState.opacity,
      });


      if (isPartOfActiveGLTransition) {
        fabricObject.set('visible', currentVisibility);
      }

      fabricObject.setCoords();


      if (this.canvas) {
        this.canvas.requestRenderAll();
      }
    }
  }

  updateEditorElement(editorElement) {
    const index = this.editorElements.findIndex(
      el => el.id === editorElement.id
    );
    if (index === -1) return;


    if (!this.isUndoRedoOperation) {
    }


    if (
      editorElement.type === 'text' &&
      editorElement.subType === 'subtitles'
    ) {
      const existingElement = this.editorElements[index];


      if (existingElement.fabricObject) {
        existingElement.fabricObject.set('text', editorElement.properties.text);
        existingElement.fabricObject.set('opacity', 1);
      }


      if (existingElement.properties.text !== editorElement.properties.text) {

        if (existingElement.properties.wordObjects?.length > 0) {
          existingElement.properties.wordObjects.forEach(obj => {
            if (obj && this.canvas?.contains(obj)) {
              this.canvas.remove(obj);
            }
          });
        }


        this.initializeWordAnimations(editorElement);


        const currentTime = this.currentTimeInMs;
        const isInside =
          editorElement.timeFrame.start <= currentTime &&
          currentTime <= editorElement.timeFrame.end;

        if (editorElement.properties.wordObjects) {
          editorElement.properties.wordObjects.forEach((wordObj, index) => {
            if (wordObj && editorElement.properties.words?.[index]) {
              const word = editorElement.properties.words[index];
              const wordIsInside =
                isInside &&
                word.start <= currentTime &&
                currentTime <= word.end;
              wordObj.set('visible', wordIsInside);
            }
          });
        }
      }
    }


    this.editorElements[index] = editorElement;


    if (this.canvas) {
      this.canvas.requestRenderAll();
    }
  }

  toggleSubtitles(boolean) {
    const subtitleElements = this.editorElements.filter(
      element => element.type === 'text' || element.subType === 'subtitles'
    );

    if (boolean) {

      if (subtitleElements.length > 0) {

        return;
      }


      if (this.hiddenSubtitles.length > 0) {

        this.shiftRowsDown(0);


        const restoredSubtitles = this.hiddenSubtitles.map(subtitle => ({
          ...subtitle,
          row: 0,
        }));
        this.editorElements = [...this.editorElements, ...restoredSubtitles];
        this.hiddenSubtitles = [];
      }
    } else {

      if (subtitleElements.length > 0) {

        this.hiddenSubtitles = [...this.hiddenSubtitles, ...subtitleElements];
        this.editorElements = this.editorElements.filter(
          element =>
            !subtitleElements.some(subtitle => subtitle.id === element.id)
        );

        this.optimizedCleanupEmptyRows();
      }
    }

    this.updateSelectedElement();
    this.refreshElements();
  }

  drawImageProp(ctx, img, x, y, w, h, offsetX = 0.5, offsetY = 0.5) {
    if (arguments.length === 2) {
      x = y = 0;
      w = ctx.canvas.width;
      h = ctx.canvas.height;
    }
    offsetX = Math.max(0, Math.min(1, offsetX));
    offsetY = Math.max(0, Math.min(1, offsetY));

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    let r = Math.min(w / iw, h / ih);
    let nw = iw * r;
    let nh = ih * r;
    let ar = 1;

    if (nw < w) ar = w / nw;
    if (Math.abs(ar - 1) < 1e-14 && nh < h) ar = h / nh;
    nw *= ar;
    nh *= ar;

    let cw = iw / (nw / w);
    let ch = ih / (nh / h);
    let cx = (iw - cw) * offsetX;
    let cy = (ih - ch) * offsetY;

    cx = Math.max(0, Math.min(iw - cw, cx));
    cy = Math.max(0, Math.min(ih - ch, cy));
    cw = Math.min(cw, iw);
    ch = Math.min(ch, ih);

    ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h);
  }

  findBestVideoPosition(targetRow, videoDuration) {
    const rowElements = this.editorElements.filter(el => el.row === targetRow);

    if (rowElements.length === 0) {
      return 0
    }

    const sortedElements = [...rowElements].sort(
      (a, b) => a.timeFrame.start - b.timeFrame.start
    );


    if (sortedElements[0].timeFrame.start >= videoDuration) {
      return 0;
    }


    for (let i = 0; i < sortedElements.length - 1; i++) {
      const gapStart = sortedElements[i].timeFrame.end;
      const gapEnd = sortedElements[i + 1].timeFrame.start;
      if (gapEnd - gapStart >= videoDuration) {
        return gapStart;
      }
    }


    const lastElement = sortedElements[sortedElements.length - 1];
    if (this.maxTime - lastElement.timeFrame.end >= videoDuration) {
      return lastElement.timeFrame.end;
    }


    return Math.max(0, this.maxTime - videoDuration);
  }

  addVideo(index) {
    const videoElement = document.getElementById(`video-${index}`);
    if (!isHtmlVideoElement(videoElement)) {
      return;
    }
    const videoDurationMs = videoElement.duration * 1000;
    const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
    const id = getUid();
    this.addEditorElement({
      id,
      name: `Media(video) ${index + 1}`,
      type: 'video',
      placement: {
        x: 0,
        y: 0,
        width: 100 * aspectRatio,
        height: 100,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      timeFrame: {
        start: 0,
        end: videoDurationMs,
      },
      properties: {
        elementId: `video-${id}`,
        src: videoElement.src,
        effect: {
          type: 'none',
        },
      },
    });
  }

  handleVideoUpload(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('video/')) {
        reject(new Error('Invalid file type. Please upload a video file.'));
        return;
      }

      if (this.playing) {
        this.setPlaying(false);
      }

      this.setCurrentTimeInMs(0);
      this.updateTimeTo(0);
      const videoElement = document.createElement('video');
      videoElement.preload = 'auto';
      videoElement.playsInline = true;
      videoElement.muted = true;
      const objectUrl = URL.createObjectURL(file);
      videoElement.src = objectUrl;
      const videoId = `${Math.random().toString(36).substr(2, 9)}`;
      videoElement.id = `video-${videoId}`;
      videoElement.onloadedmetadata = async () => {

        const videoDurationMs = videoElement.duration * 1000;



        if (videoDurationMs > this.maxTime) {
          this.setMaxTime(videoDurationMs);
        }
        const generateThumbnails = async () => {
          const thumbnails = [];

          const count = Math.max(3, Math.round(videoElement.duration));


          const timelineWidth =
            document.querySelector('.timelineGrid')?.offsetWidth ||
            window.innerWidth ||
            800;

          const thumbWidth = Math.max(
            32,
            Math.floor(videoElement.videoWidth / count)
          );

          const timelineHeight =
            document.querySelector('.timelineGrid')?.offsetHeight ||
            window.innerHeight ||
            400;
          const thumbHeight = Math.max(
            40,
            Math.floor(videoElement.videoHeight * 0.12)
          )

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = thumbWidth;
          canvas.height = thumbHeight;

          for (let i = 0; i < count; i++) {
            const time = (videoElement.duration * i) / (count - 3 || 3);
            videoElement.currentTime = time;
            await new Promise(res =>
              videoElement.addEventListener('seeked', res, { once: true })
            );
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            thumbnails.push(canvas.toDataURL('image/jpeg', 0.7));
          }
          return thumbnails;
        };
        const thumbnails = await generateThumbnails();

        const canvasWidth = this.canvas?.width || 299.812;
        const canvasHeight = this.canvas?.height || 533;

        const targetWidth = canvasWidth;
        const targetHeight = canvasHeight;

        const scaleX = targetWidth / videoElement.videoWidth;
        const scaleY = targetHeight / videoElement.videoHeight;
        const displayWidth = targetWidth;
        const displayHeight = targetHeight;
        const xPos = 0;

        const existingElements = this.editorElements;
        let newRow = 0;


        const row0Elements = existingElements.filter(el => el.row === 0);
        const hasVideoInRow0 = row0Elements.some(el => el.type === 'video');
        const hasOtherTypesInRow0 = row0Elements.some(
          el => el.type !== 'video'
        );

        if (
          row0Elements.length === 0 ||
          (hasVideoInRow0 && !hasOtherTypesInRow0)
        ) {

          if (row0Elements.length === 0) {
            newRow = 0;
          } else {

            const sortedElements = [...row0Elements].sort(
              (a, b) => a.timeFrame.start - b.timeFrame.start
            );

            let hasSpace = false;


            if (sortedElements[0].timeFrame.start >= videoDurationMs) {
              hasSpace = true;
              newRow = 0;
            } else {

              for (let i = 0; i < sortedElements.length - 1; i++) {
                const gapStart = sortedElements[i].timeFrame.end;
                const gapEnd = sortedElements[i + 1].timeFrame.start;
                if (gapEnd - gapStart >= videoDurationMs) {
                  hasSpace = true;
                  newRow = 0;
                  break;
                }
              }


              if (!hasSpace) {
                const lastElement = sortedElements[sortedElements.length - 1];
                if (
                  this.maxTime - lastElement.timeFrame.end >=
                  videoDurationMs
                ) {
                  hasSpace = true;
                  newRow = 0;
                }
              }
            }

            if (!hasSpace) {
              newRow = 1;
            }
          }
        } else {

          newRow = 1;
          while (true) {
            const rowElements = existingElements.filter(
              el => el.row === newRow
            );
            if (rowElements.length === 0) {
              break
            }

            const hasOnlyVideos = rowElements.every(el => el.type === 'video');
            if (hasOnlyVideos) {

              const sortedElements = [...rowElements].sort(
                (a, b) => a.timeFrame.start - b.timeFrame.start
              );

              let hasSpace = false;


              for (let i = 0; i <= sortedElements.length; i++) {
                const gapStart =
                  i === 0 ? 0 : sortedElements[i - 1].timeFrame.end;
                const gapEnd =
                  i === sortedElements.length
                    ? this.maxTime
                    : sortedElements[i].timeFrame.start;

                if (gapEnd - gapStart >= videoDurationMs) {
                  hasSpace = true;
                  break;
                }
              }

              if (hasSpace) {
                break
              }
            }

            newRow++;
          }
        }


        this.maxRows = Math.max(this.maxRows, newRow + 1);
        videoElement.playbackRate = this.playbackRate || 1;

        const existingVideos = this.editorElements.filter(
          el => el.type === 'video'
        );
        existingVideos.forEach(video => {
          const videoEl = document.getElementById(video.properties.elementId);
          if (videoEl) {
            videoEl.pause();
            videoEl.currentTime = 0;
            videoEl.style.display = 'none';
            videoEl.style.visibility = 'hidden';
            videoEl.style.opacity = '0';
            videoEl.style.pointerEvents = 'none';
          }
          if (video.fabricObject) {
            video.fabricObject.set({
              visible: false,
              opacity: 0,
              selectable: false,
              evented: false,
              zIndex: 0,
            });
            video.fabricObject.setCoords();
          }
        });

        this.videos.push({
          element: videoElement,
          id: videoId,
          url: objectUrl,
          name: `Video`,
          duration: videoDurationMs,
          thumbnails,
        });

        const existingElement = this.editorElements.find(
          el => el.id === videoId
        );
        if (!existingElement) {

          const maxZIndex = Math.max(
            ...this.editorElements.map(el => el.properties?.zIndex || 0),
            0
          );

          this.addEditorElement({
            id: videoId,
            name: `Video`,
            type: 'video',
            placement: {
              x: xPos,
              y: 0,
              width: displayWidth,
              height: displayHeight,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
            },
            timeFrame: (() => {
              const startPosition = this.findBestVideoPosition(
                newRow,
                videoDurationMs
              );
              return {
                start: startPosition,
                end: startPosition + videoDurationMs,
              };
            })(),
            row: newRow,
            properties: {
              elementId: `video-${videoId}`,
              src: objectUrl,
              effect: {
                type: 'none',
              },
              width: videoElement.videoWidth,
              height: videoElement.videoHeight,
              isInTimeline: true,
              thumbnails,
              thumbnailDuration: videoDurationMs / thumbnails.length,
              zIndex: maxZIndex + 1,
              isActive: true,
            },
          });


          if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
            window.dispatchSaveTimelineState(this);
          }

          videoElement.style.display = 'block';
          videoElement.style.visibility = 'visible';
          videoElement.style.opacity = '1';
          videoElement.style.pointerEvents = 'auto';
          videoElement.style.zIndex = '10000000000001';

          const videoElements = document.querySelectorAll('video');
          videoElements.forEach(video => {
            video.pause();
            video.remove();
          });
          if (this.canvas) {
            this.canvas.getObjects().forEach(obj => {
              this.canvas.remove(obj);
            });

            this.canvas.clear();
            const fabricObject = this.editorElements.find(
              el => el.id === videoId
            )?.fabricObject;
            if (fabricObject) {
              fabricObject.set({
                visible: true,
                opacity: 1,
                selectable: true,
                evented: true,
                zIndex: maxZIndex + 1,
              });
              fabricObject.setCoords();
            }
            this.canvas.renderAll();
            this.canvas.requestRenderAll();
          }
          const debugStartPosition = this.findBestVideoPosition(
            newRow,
            videoDurationMs
          );
        }
        resolve();
      };
      videoElement.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load video file.'));
      };
    });
  }


  addVideoLoadingPlaceholder({ title, row = 0, estimatedDuration = 10000 }) {
    const placeholderId = `loading-video-${Math.random()
      .toString(36)
      .substr(2, 9)}`;


    const startPosition = this.findBestVideoPosition(row, estimatedDuration);

    const placeholderElement = {
      id: placeholderId,
      name: title,
      type: 'video',
      isLoading: true,
      timeFrame: {
        start: startPosition,
        end: startPosition + estimatedDuration,
      },
      properties: {
        src: '',
        isPlaceholder: true,
      },
      fabricObject: null,
      row: row,
    };

    runInAction(() => {
      this.editorElements.push(placeholderElement);
      this.maxRows = Math.max(this.maxRows, row + 1);
    });


    if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
      window.dispatchSaveTimelineState(this);
    }

    return placeholderId;
  }


  replaceVideoPlaceholder(placeholderId, videoData) {
    const elementIndex = this.editorElements.findIndex(
      el => el.id === placeholderId && el.isLoading
    );

    if (elementIndex !== -1) {
      runInAction(() => {

        const oldElement = this.editorElements[elementIndex];


        this.editorElements[elementIndex] = {
          ...oldElement,
          ...videoData,
          isLoading: false,
        };


        if (videoData.fabricObject && videoData.placement) {
          const fabricVideo = videoData.fabricObject;
          fabricVideo.set({
            left: videoData.placement.x,
            top: videoData.placement.y,
            width: videoData.placement.width,
            height: videoData.placement.height,
            scaleX: videoData.placement.scaleX,
            scaleY: videoData.placement.scaleY,
            angle: videoData.placement.rotation || 0,
          });


          if (!this.canvas.contains(fabricVideo)) {
            this.canvas.add(fabricVideo);
          }


          this.canvas.renderAll();
        }
      });


      if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
        window.dispatchSaveTimelineState(this);
      }
    }
  }

  async handleVideoUploadFromUrl({
    url,
    title = 'Video',
    key = null,
    duration = null,
    row = 0,
    startTime = null,
    isNeedLoader = true,
  }) {
    let placeholderId = null;

    if (isNeedLoader) {
      placeholderId = this.addVideoLoadingPlaceholder({
        title: title || 'Loading Animation...',
        row,
        estimatedDuration: duration || 10000,
      });
    }

    return new Promise((resolve, reject) => {
      const videoElement = document.createElement('video');
      videoElement.preload = 'auto';
      videoElement.playsInline = true;
      videoElement.muted = true;

      if (!url.startsWith('blob:')) {
        videoElement.crossOrigin = 'anonymous';
      }

      const videoUrl = url.startsWith('blob:')
        ? url
        : `${url}?v=${Date.now()}`;
      videoElement.src = videoUrl;
      videoElement.style.display = 'none';
      videoElement.muted = false;
      videoElement.volume = 1.0;
      videoElement.controls = true;
      document.body.appendChild(videoElement);

      const videoId = key || `video-${Math.random().toString(36).substr(2, 9)}`;
      videoElement.id = `video-${videoId}`;

      videoElement.onloadedmetadata = async () => {
        const videoDurationMs = videoElement?.duration
          ? videoElement.duration * 1000
          : duration;

        const generateThumbnails = async () => {
          const thumbnails = [];
          const count = Math.max(3, Math.round(videoElement.duration));
          const timelineWidth =
            document.querySelector('.timelineGrid')?.offsetWidth || 800;
          const thumbWidth = Math.floor(timelineWidth / count);
          const timelineHeight =
            document.querySelector('.timelineGrid')?.offsetHeight || 400;
          const thumbHeight = Math.max(40, Math.floor(timelineHeight * 0.12));
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = thumbWidth;
          canvas.height = thumbHeight;

          for (let i = 0; i < count; i++) {
            const time = (videoElement.duration * i) / (count - 3 || 3);
            videoElement.currentTime = time;
            await new Promise(res =>
              videoElement.addEventListener('seeked', res, { once: true })
            );
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            thumbnails.push(canvas.toDataURL('image/jpeg', 0.7));
          }
          return thumbnails;
        };

        const thumbnails = await generateThumbnails();


        const canvasWidth = this.canvas?.width || 299.812;
        const canvasHeight = this.canvas?.height || 533;

        const targetWidth = canvasWidth;
        const targetHeight = canvasHeight;

        const scaleX = targetWidth / videoElement.videoWidth;
        const scaleY = targetHeight / videoElement.videoHeight;
        const displayWidth = targetWidth;
        const displayHeight = targetHeight;
        const xPos = 0;


        const existingElements = this.editorElements;
        let targetRow = row;



        if (row === 0 && startTime === null) {

          const row0Elements = existingElements.filter(el => el.row === 0);
          const hasVideoInRow0 = row0Elements.some(el => el.type === 'video');
          const hasOtherTypesInRow0 = row0Elements.some(
            el => el.type !== 'video'
          );

          if (
            row0Elements.length === 0 ||
            (hasVideoInRow0 && !hasOtherTypesInRow0)
          ) {

            if (row0Elements.length === 0) {
              targetRow = 0;
            } else {

              const sortedElements = [...row0Elements].sort(
                (a, b) => a.timeFrame.start - b.timeFrame.start
              );

              let hasSpace = false;
              const videoDuration = videoDurationMs;


              if (sortedElements[0].timeFrame.start >= videoDuration) {
                hasSpace = true;
                targetRow = 0;
              } else {

                for (let i = 0; i < sortedElements.length - 1; i++) {
                  const gapStart = sortedElements[i].timeFrame.end;
                  const gapEnd = sortedElements[i + 1].timeFrame.start;
                  if (gapEnd - gapStart >= videoDuration) {
                    hasSpace = true;
                    targetRow = 0;
                    break;
                  }
                }


                if (!hasSpace) {
                  const lastElement = sortedElements[sortedElements.length - 1];
                  if (
                    this.maxTime - lastElement.timeFrame.end >=
                    videoDuration
                  ) {
                    hasSpace = true;
                    targetRow = 0;
                  }
                }
              }

              if (!hasSpace) {
                targetRow = 1;
              }
            }
          } else {

            targetRow = 1;
            while (true) {
              const rowElements = existingElements.filter(
                el => el.row === targetRow
              );
              if (rowElements.length === 0) {
                break
              }

              const hasOnlyVideos = rowElements.every(
                el => el.type === 'video'
              );
              if (hasOnlyVideos) {

                const sortedElements = [...rowElements].sort(
                  (a, b) => a.timeFrame.start - b.timeFrame.start
                );

                let hasSpace = false;
                const videoDuration = videoDurationMs;


                for (let i = 0; i <= sortedElements.length; i++) {
                  const gapStart =
                    i === 0 ? 0 : sortedElements[i - 1].timeFrame.end;
                  const gapEnd =
                    i === sortedElements.length
                      ? this.maxTime
                      : sortedElements[i].timeFrame.start;

                  if (gapEnd - gapStart >= videoDuration) {
                    hasSpace = true;
                    break;
                  }
                }

                if (hasSpace) {
                  break
                }
              }

              targetRow++;
            }
          }
        }


        runInAction(() => {
          this.maxRows = Math.max(this.maxRows, targetRow + 1);
        });
        videoElement.playbackRate = this.playbackRate || 1;



        const existingVideoElements = this.editorElements.filter(
          el =>
            el.type === 'video' &&
            el.row === targetRow &&
            el.properties?.src?.startsWith('blob:')
        );



        if (existingVideoElements.length > 0 && row === 0 && startTime === null) {
          targetRow = existingVideoElements[0].row;
        }


        runInAction(() => {
          this.videos.push({
            element: videoElement,
            id: videoId,
            url,
            name: title,
            duration: videoDurationMs,
            thumbnails,
          });
        });


        const placeholderElement = this.editorElements.find(
          el => el.isLoading && el.type === 'video' && el.row === targetRow
        );

        const existingElement = this.editorElements.find(
          el => el.id === videoId
        );

        if (placeholderElement) {

          const fabricVideo = new fabric.VideoImage(videoElement, {
            left: xPos,
            top: 0,
            width: displayWidth,
            height: displayHeight,
            scaleX: 1,
            scaleY: 1,
            angle: 0,
            selectable: true,
            objectCaching: false,
            lockUniScaling: false,
            hasControls: true,
            hasBorders: true,
            type: 'video',
          });
          this.canvas.add(fabricVideo);


          this.canvas.requestRenderAll();

          this.replaceVideoPlaceholder(placeholderId, {
            id: videoId,
            name: title,
            type: 'video',
            placement: {
              x: xPos,
              y: 0,
              width: displayWidth,
              height: displayHeight,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
            },
            timeFrame: {
              start: placeholderElement.timeFrame.start,
              end: placeholderElement.timeFrame.start + videoDurationMs,
            },
            properties: {
              elementId: `video-${videoId}`,
              src: url,
              effect: { type: 'none' },
              width: videoElement.videoWidth,
              height: videoElement.videoHeight,
              isInTimeline: true,
              thumbnails,
              thumbnailDuration: videoDurationMs / thumbnails.length,
              duration: videoDurationMs,
            },
            fabricObject: fabricVideo,
            row: targetRow,
          });


          this.refreshElements();
        } else if (!existingElement) {

          const fabricVideo = new fabric.VideoImage(videoElement, {
            left: xPos,
            top: 0,
            width: displayWidth,
            height: displayHeight,
            scaleX: 1,
            scaleY: 1,
            angle: 0,
            selectable: true,
            objectCaching: false,
            lockUniScaling: false,
            hasControls: true,
            hasBorders: true,
            type: 'video',
          });

          this.canvas.add(fabricVideo);





          const shouldReplaceTemp =
            startTime !== null &&
            existingVideoElements.some(el => el.timeFrame?.start === startTime);
          
          if (shouldReplaceTemp) {
            const tempElement = existingVideoElements.find(
              el => el.timeFrame?.start === startTime
            );


            const elementIndex = this.editorElements.findIndex(
              el => el.id === tempElement.id
            );

            if (elementIndex !== -1) {

              if (
                tempElement.fabricObject &&
                this.canvas.contains(tempElement.fabricObject)
              ) {
                this.canvas.remove(tempElement.fabricObject);
              }


              videoElement.id = `video-${videoId}`;


              runInAction(() => {
                const startPosition =
                  startTime !== null
                    ? startTime
                    : this.findBestVideoPosition(targetRow, videoDurationMs);
                this.editorElements[elementIndex] = {
                  ...tempElement,
                  name: title,
                  type: 'video',
                  timeFrame: {
                    start: startPosition,
                    end: startPosition + videoDurationMs,
                  },
                  properties: {
                    ...tempElement.properties,
                    elementId: `video-${videoId}`,
                    src: url,
                    thumbnails,
                    thumbnailDuration: videoDurationMs / thumbnails.length,
                    duration: videoDurationMs,
                    isInTimeline: true,
                  },
                  fabricObject: fabricVideo,
                };
              });


              if (
                window.dispatchSaveTimelineState &&
                !this.isUndoRedoOperation
              ) {
                window.dispatchSaveTimelineState(this);
              }
            }
          } else {

            this.addEditorElement({
              id: videoId,
              name: title,
              type: 'video',
              placement: {
                x: xPos,
                y: 0,
                width: displayWidth,
                height: displayHeight,
                rotation: 0,
              scaleX: 1,
              scaleY: 1,
              },
              timeFrame: (() => {
                const startPosition =
                  startTime !== null
                    ? startTime
                    : this.findBestVideoPosition(targetRow, videoDurationMs);
                return {
                  start: startPosition,
                  end: startPosition + videoDurationMs,
                };
              })(),
              row: targetRow,
              properties: {
                elementId: `video-${videoId}`,
                src: url,
                effect: { type: 'none' },
                width: videoElement.videoWidth,
                height: videoElement.videoHeight,
                isInTimeline: true,
                thumbnails,
                thumbnailDuration: videoDurationMs / thumbnails.length,
                duration: videoDurationMs,
              },
              fabricObject: fabricVideo,
            });


            if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
              window.dispatchSaveTimelineState(this);
            }
          }



          this.refreshElements();

          const debugStartPosition2 = this.findBestVideoPosition(
            targetRow,
            videoDurationMs
          );
        }

        resolve();
      };

      videoElement.onerror = e => {
        console.error('Error loading video:', e);


        if (placeholderId) {
          const placeholderIndex = this.editorElements.findIndex(
            el => el.id === placeholderId && el.isLoading
          );
          if (placeholderIndex !== -1) {
            runInAction(() => {
              this.editorElements.splice(placeholderIndex, 1);
            });
          }
        }

        reject(new Error('Failed to load video from URL'));
      };
    });
  }

  addPlaceholderImage = ({
    imageId,
    startTime,
    endTime,
    pointId,
    sentence,
    row,
  }) => {
    return new Promise(resolve => {
      const canvasWidth = this.canvas?.width || 0;
      const maxCanvasHeight = this.canvas?.height || 0;

      const placeholderUrl =
        'https://storage.googleapis.com/images-livespro/1749852534414-min-1200px-hd-transparent-picture-png.webp';

      const cacheBustPlaceholderUrl = placeholderUrl + '?_cb=' + Date.now();

      fabric.Image.fromURL(
        cacheBustPlaceholderUrl,
        img => {
          const scale =
            Math.min(canvasWidth / img.width, maxCanvasHeight / img.height) *
            0.5;

          const regularLeft = (canvasWidth - img.width * scale) / 2;
          const regularTop = (maxCanvasHeight - img.height * scale) / 2;


          img.set({
            name: imageId || getUid(),
            left: regularLeft,
            top: regularTop,
            scaleX: scale,
            scaleY: scale,
            selectable: true,
            lockUniScaling: true,
            objectCaching: true,
            opacity: 0.5
          });

          const element = {
            id: imageId || getUid(),
            name: `Media(placeholder) ${this.editorElements.length + 1}`,
            type: 'imageUrl',
            subType: 'placeholder',
            pointId,
            sentence,
            placement: {
              x: regularLeft,
              y: regularTop,
              width: img.width * scale,
              height: img.height * scale,
              rotation: 0,
              scaleX: scale,
              scaleY: scale,
            },
            timeFrame: {
              start: startTime,
              end: endTime,
            },
            row: row,
            from: 0,
            isDragging: false,
            properties: {
              src: 'https://storage.googleapis.com/images-livespro/1749852534414-min-1200px-hd-transparent-picture-png.webp',
              minUrl:
                'https://storage.googleapis.com/images-livespro/1749852534414-min-1200px-hd-transparent-picture-png.webp',
              effect: {
                type: 'none',
              },
              width: img.width,
              height: img.height,
            },
            fabricObject: img,
          };

          this.addEditorElement(element, true);

          if (this.canvas) {
            this.canvas.add(img);
            this.canvas.renderAll();
          }

          resolve(element);
        },
        { crossOrigin: 'anonymous' }
      );
    });
  };

  addImageLocal({ url, minUrl, startTime = 0, endTime, row = 0 }) {
    return new Promise((resolve, reject) => {
      const imageElement = new Image();

      if (!url.startsWith('blob:')) {
        imageElement.crossOrigin = 'Anonymous';
      }

      const cacheBustUrl = url.startsWith('blob:')
        ? url
        : url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
      imageElement.src = cacheBustUrl;

      imageElement.onload = () => {
        try {
          fabric.Image.fromURL(
            cacheBustUrl,
            img => {

              const canvasWidth = this.canvas?.width || 0;
              const maxCanvasHeight = this.canvas?.height || 0;

              const scale = Math.min(
                canvasWidth / img.width,
                maxCanvasHeight / img.height
              );

              const displayWidth = img.width * scale;
              const displayHeight = img.height * scale;


              const regularLeft = (canvasWidth - displayWidth) / 2;
              const regularTop = (maxCanvasHeight - displayHeight) / 2;

              const id = getUid();
              const newElement = {
                id,
                name: `Media(imageUrl) ${this.editorElements.length + 1}`,
                type: 'imageUrl',
                placement: {
                  x: regularLeft,
                  y: regularTop,
                  width: displayWidth,
                  height: displayHeight,
                  rotation: 0,
                  scaleX: scale,
                  scaleY: scale,
                },
                timeFrame: {
                  start: startTime,
                  end: endTime || startTime + 5000
                },
                row,
                from: 0,
                isDragging: false,
                properties: {
                  src: url,
                  minUrl: minUrl,
                  effect: {
                    type: 'none',
                  },
                  width: img.width,
                  height: img.height,
                },
              };


              const sortedElements = [...this.editorElements].sort((a, b) => {
                if (a.type === 'text' && b.type !== 'text') return 1;
                if (b.type === 'text' && a.type !== 'text') return -1;
                return b.row - a.row;
              });


              let insertIndex = sortedElements.findIndex(el => el.row <= row);
              if (insertIndex === -1) insertIndex = sortedElements.length;


              sortedElements.splice(insertIndex, 0, newElement);


              const imageObject = new fabric.Image(img.getElement(), {
                name: id,
                left: regularLeft,
                top: regularTop,
                scaleX: scale,
                scaleY: scale,
                selectable: true,
                lockUniScaling: true,
                objectCaching: true,
              });


              newElement.fabricObject = imageObject;


              runInAction(() => {
                this.editorElements = sortedElements;
                if (!this.isInitializing) {
                }
              });


              if (
                window.dispatchSaveTimelineState &&
                !this.isUndoRedoOperation
              ) {
                window.dispatchSaveTimelineState(this);
              }


              this.canvas.add(imageObject);
              this.canvas.moveTo(imageObject, insertIndex);


              this.refreshElements();

              resolve();
            },
            {

              crossOrigin: url.startsWith('blob:') ? undefined : 'Anonymous',
            }
          );
        } catch (error) {
          console.error('Error loading image:', error);
          reject(error);
        }
      };

      imageElement.onerror = error => {
        console.error('Image failed to load:', error);
        reject(error);
      };
    });
  }

  addImageToCanvas = ({
    store,
    url,
    minUrl,
    imageId,
    startTime,
    endTime,
    pointId,
    point,
    sentence,
    storyId,
    row,
    isExisting = false,
  }) => {
    const hasElementsInFirstRow = this.editorElements.some(
      element => element.row === 1 && element.type !== 'imageUrl'
    );


    if (hasElementsInFirstRow) {
      this.shiftRowsDown(1);
    }

    if (!url) {
      return this.addPlaceholderImage({
        imageId,
        startTime,
        endTime,
        pointId,
        sentence,
        storyId,
        row: row ? row : hasElementsInFirstRow ? 1 : 0,
      });
    }

    return new Promise((resolve, reject) => {
      const imageElement = new Image();
      imageElement.crossOrigin = 'Anonymous';

      const cacheBustUrl =
        url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
      imageElement.src = cacheBustUrl;

      imageElement.onload = () => {
        try {
          fabric.Image.fromURL(
            cacheBustUrl,
            img => {
              const canvasWidth = store.canvas.width;
              const maxCanvasHeight = store.canvas.height;

              const scale = Math.min(
                canvasWidth / img.width,
                maxCanvasHeight / img.height
              );

              const regularLeft = (canvasWidth - img.width * scale) / 2;
              const regularTop = (maxCanvasHeight - img.height * scale) / 2;

              const id = imageId || getUid();

              store.addEditorElement(
                {
                  id,
                  name: `Media(imageUrl) ${store.editorElements.length + 1}`,
                  type: 'imageUrl',
                  pointId,
                  point,
                  sentence,
                  storyId,
                  placement: {
                    x: regularLeft,
                    y: regularTop,
                    width: img.width * scale,
                    height: img.height * scale,
                    rotation: 0,
                    scaleX: scale,
                    scaleY: scale,
                  },
                  defaultState: {
                    scaleX: scale,
                    scaleY: scale,
                    left: regularLeft,
                    top: regularTop,
                    opacity: 1,
                  },
                  timeFrame: {
                    start: startTime,
                    end: endTime,
                  },
                  row: row ? row : hasElementsInFirstRow ? 1 : 0,
                  from: 0,
                  isDragging: false,
                  properties: {
                    src: url,
                    minUrl,
                    effect: {
                      type: 'none',
                    },
                    width: img.width,
                    height: img.height,
                    background: {
                      color: '#000000',
                      opacity: 0,
                    },
                  },
                },
                true
              );

              resolve();
            },
            null,
            { crossOrigin: 'anonymous' }
          );
        } catch (error) {
          console.error('Error during refreshElements:', error);
          reject(error);
        }
      };

      imageElement.onerror = error => {
        console.error('Image failed to load:', error);
        reject(error);
      };
    });
  };

  setImageOnCanvas = ({ url, element }) => {
    const { id, pointId, sentence, timeFrame, row } = element;

    const hasElementsInFirstRow = this.editorElements.some(
      element => element.row === 1 && element.type !== 'imageUrl'
    );

    if (!url) {
      return this.addPlaceholderImage({
        imageId: id,
        startTime: timeFrame.start,
        endTime: timeFrame.end,
        pointId,
        sentence,
        storyId: this.storyId,
        row: row ? row : hasElementsInFirstRow ? 1 : 0,
      });
    }

    return new Promise((resolve, reject) => {
      const imageElement = new Image();
      imageElement.crossOrigin = 'Anonymous';

      const cacheBustUrl =
        url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
      imageElement.src = cacheBustUrl;

      imageElement.onload = () => {
        try {
          fabric.Image.fromURL(
            cacheBustUrl,
            img => {

              img.set({
                name: id,
                left: element.placement.x,
                top: element.placement.y,
                angle: element.placement.rotation,
                scaleX: element.placement.scaleX,
                scaleY: element.placement.scaleY,
                selectable: true,
                lockUniScaling: true,
                objectCaching: true,
              });

              const updatedElement = {
                ...element,
                properties: {
                  ...element.properties,
                  effect: {
                    type: 'none',
                  },
                  width: img.width,
                  height: img.height,
                },
                isDragging: false,
                name: `Media(imageUrl)`,
                fabricObject: img,
                initialState: {
                  scaleX: element.placement.scaleX,
                  scaleY: element.placement.scaleY,
                  left: element.placement.x,
                  top: element.placement.y,
                  opacity: 1.0,
                },
              };


              this.canvas.add(img);

              this.addEditorElement(updatedElement, true);

              resolve();
            },
            { crossOrigin: 'anonymous' }
          );
        } catch (error) {
          console.error('Error during refreshElements:', error);
          reject(error);
        }
      };

      imageElement.onerror = error => {
        console.error('Image failed to load:', error);
        reject(error);
      };
    });
  };

  updateCanvasImage = async ({ url, minUrl, pointId, id }) => {
    return await new Promise((resolve, reject) => {

      const existingElement = this.editorElements.find(
        el => el.type === 'imageUrl' && (el.id === id || el.pointId === pointId)
      );

      if (!existingElement) {
        resolve();
        return;
      }


      if (!url || url === null || url === undefined) {

        if (existingElement.fabricObject && this.canvas) {
          this.canvas.remove(existingElement.fabricObject);
          existingElement.fabricObject = null;
        }

        const placeholderUrl =
          'https://storage.googleapis.com/images-livespro/1749852534414-min-1200px-hd-transparent-picture-png.webp';


        const cacheBustPlaceholderUrl = placeholderUrl + '?_cb=' + Date.now();

        fabric.Image.fromURL(
          cacheBustPlaceholderUrl,
          img => {
            const canvasWidth = this.canvas?.width || 0;
            const maxCanvasHeight = this.canvas?.height || 0;


            const hasCustomPlacement =
              existingElement.placement &&
              existingElement.placement.x !== undefined &&
              existingElement.placement.y !== undefined &&
              existingElement.subType !== 'placeholder';

            let finalLeft, finalTop, finalScaleX, finalScaleY;

            if (hasCustomPlacement) {

              finalLeft = existingElement.placement.x;
              finalTop = existingElement.placement.y;
              finalScaleX = existingElement.placement.scaleX || 1;
              finalScaleY = existingElement.placement.scaleY || 1;
            } else {

              const scale = Math.min(
                canvasWidth / img.width,
                maxCanvasHeight / img.height
              );
              finalLeft = (canvasWidth - img.width * scale) / 2;
              finalTop = (maxCanvasHeight - img.height * scale) / 2;
              finalScaleX = scale;
              finalScaleY = scale;
            }


            img.set({
              name: existingElement.id,
              left: finalLeft,
              top: finalTop,
              scaleX: finalScaleX,
              scaleY: finalScaleY,
              selectable: true,
              lockUniScaling: true,
              objectCaching: true,
              opacity: 0.5,
            });

            const updatedElement = {
              ...existingElement,
              subType: 'placeholder',
              placement: {
                ...existingElement.placement,
                x: finalLeft,
                y: finalTop,
                width: img.width * finalScaleX,
                height: img.height * finalScaleY,
                rotation: existingElement.placement.rotation || 0,
                scaleX: finalScaleX,
                scaleY: finalScaleY,
              },
              defaultState: {
                scaleX: finalScaleX,
                scaleY: finalScaleY,
                left: finalLeft,
                top: finalTop,
                opacity: 1,
              },
              properties: {
                ...existingElement.properties,
                src: placeholderUrl,
                minUrl: placeholderUrl,
                width: img.width,
                height: img.height,
              },
              fabricObject: img,
            };


            this.editorElements = this.editorElements.map(el => {
              if (el.id === existingElement.id) {
                return updatedElement;
              }
              return el;
            });


            if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
              window.dispatchSaveTimelineState(this);
            }


            if (this.canvas) {
              this.canvas.add(img);
              this.canvas.renderAll();
            }

            this.refreshElements();
            resolve();
          },
          { crossOrigin: 'anonymous' }
        );
        return;
      }


      this.loadImageAsBlobUrl(url)
        .then(blobUrl => {
          const imageElement = new Image();
          imageElement.crossOrigin = 'Anonymous';
          imageElement.src = blobUrl;

          imageElement.onerror = error => {
            console.error('Image failed to load:', error);


            if (blobUrl.startsWith('blob:')) {
              URL.revokeObjectURL(blobUrl);
            }


            const updatedElement = {
              ...existingElement,
              properties: {
                ...existingElement.properties,
                src: null,
                minUrl: null,
              },
            };


            if (existingElement.fabricObject && this.canvas) {
              this.canvas.remove(existingElement.fabricObject);
              existingElement.fabricObject = null;
            }


            this.editorElements = this.editorElements.map(el => {
              if (el.id === existingElement.id) {
                return updatedElement;
              }
              return el;
            });




            if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
              window.dispatchSaveTimelineState(this);
            }

            this.refreshElements();

            resolve();
          };

          imageElement.onload = () => {
            try {

              if (existingElement.fabricObject && this.canvas) {
                this.canvas.remove(existingElement.fabricObject);
                existingElement.fabricObject = null;
              }

              fabric.Image.fromURL(
                blobUrl,
                img => {
                  const canvasWidth = this.canvas.width;
                  const maxCanvasHeight = this.canvas.height;


                  const hasCustomPlacement =
                    existingElement.placement &&
                    existingElement.placement.x !== undefined &&
                    existingElement.placement.y !== undefined &&
                    existingElement.subType !== 'placeholder';

                  let finalLeft, finalTop, finalScaleX, finalScaleY;

                  if (hasCustomPlacement) {

                    finalLeft = existingElement.placement.x;
                    finalTop = existingElement.placement.y;
                    finalScaleX = existingElement.placement.scaleX || 1;
                    finalScaleY = existingElement.placement.scaleY || 1;
                  } else {

                    const scale = Math.min(
                      canvasWidth / img.width,
                      maxCanvasHeight / img.height
                    );
                    finalLeft = (canvasWidth - img.width * scale) / 2;
                    finalTop = (maxCanvasHeight - img.height * scale) / 2;
                    finalScaleX = scale;
                    finalScaleY = scale;
                  }


                  img.set({
                    name: existingElement.id,
                    left: finalLeft,
                    top: finalTop,
                    angle: existingElement.placement.rotation || 0,
                    scaleX: finalScaleX,
                    scaleY: finalScaleY,
                    selectable: true,
                    lockUniScaling: true,
                    objectCaching: true,
                  });


                  const updatedElement = {
                    ...existingElement,
                    subType: 'image',
                    placement: {
                      ...existingElement.placement,
                      x: finalLeft,
                      y: finalTop,
                      width: img.width * finalScaleX,
                      height: img.height * finalScaleY,
                      rotation: existingElement.placement.rotation || 0,
                      scaleX: finalScaleX,
                      scaleY: finalScaleY,
                    },
                    defaultState: {
                      scaleX: finalScaleX,
                      scaleY: finalScaleY,
                      left: finalLeft,
                      top: finalTop,
                      opacity: 1,
                    },
                    properties: {
                      ...existingElement.properties,
                      src: url,
                      minUrl: minUrl,
                      width: img.width,
                      height: img.height,
                    },
                    fabricObject: img,
                  };


                  this.canvas.add(img);


                  this.editorElements = this.editorElements.map(el => {
                    if (el.id === existingElement.id) {
                      return updatedElement;
                    }
                    return el;
                  });




                  if (
                    window.dispatchSaveTimelineState &&
                    !this.isUndoRedoOperation
                  ) {
                    window.dispatchSaveTimelineState(this);
                  }

                  this.refreshElements();


                  this.forceCanvasCleanup()
                    .then(() => {
                      if (blobUrl.startsWith('blob:')) {
                        URL.revokeObjectURL(blobUrl);
                      }
                      resolve();
                    })
                    .catch(() => {
                      if (blobUrl.startsWith('blob:')) {
                        URL.revokeObjectURL(blobUrl);
                      }
                      resolve();
                    });
                },
                null,
                { crossOrigin: 'anonymous' }
              );
            } catch (error) {
              console.error('Error updating canvas image:', error);
              reject(error);
            }
          };
        })
        .catch(error => {
          console.error('Failed to load image as blob:', error);
          reject(error);
        });
    });
  };


  async loadImageAsBlobUrl(url) {
    try {
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (error) {
      return url;
    }
  }


  async forceCanvasCleanup() {
    if (!this.canvas) return;

    try {

      this.canvas.requestRenderAll();


      await new Promise(resolve => setTimeout(resolve, 100));


      const ctx = this.canvas.getContext
        ? this.canvas.getContext('2d')
        : this.canvas.contextContainer;
      if (ctx) {
        try {
          ctx.getImageData(0, 0, 1, 1);
        } catch (securityError) {

          await this.refreshElements();
        }
      }
    } catch (error) {

    }
  }

  addAudio(index) {
    const audioElement = document.getElementById(`audio-${index}`);
    if (!isHtmlAudioElement(audioElement)) {
      return;
    }
    const audioDurationMs = audioElement.duration * 1000;
    const id = getUid();


    const usedRows = new Set(
      this.editorElements
        .filter(el => el.type === 'audio' || el.type === 'sound')
        .map(el => el.row || 0)
    );

    let newRow = 0;
    while (usedRows.has(newRow)) {
      newRow++;
    }


    this.maxRows = Math.max(this.maxRows, newRow + 1);

    this.addEditorElement({
      id,
      name: `Media(audio) ${index + 1}`,
      type: 'sound',
      placement: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      row: newRow,
      timeFrame: {
        start: 0,
        end: audioDurationMs,
      },
      properties: {
        elementId: `audio-${id}`,
        src: audioElement.src,
      },
    });
  }

  async addExistingAudio({
    base64Audio,
    durationMs,
    duration,
    row,
    startTime = 0,
    audioType,
    id,
    text,
    name,
    audioOffset,
    autoSubtitles = false,
    properties,
  }) {
    let audioSrc;
    if (base64Audio.startsWith('//')) {
      audioSrc = `data:audio/wav;base64,${base64Audio}`;
    } else {
      audioSrc = base64Audio;
    }


    if (row === undefined) {
      const usedRows = new Set(
        this.editorElements
          .filter(el => el.type === 'audio' || el.type === 'sound')
          .map(el => el.row || 0)
      );

      row = 0;
      while (usedRows.has(row)) {
        row++;
      }
    }
    this.maxRows = Math.max(this.maxRows, row + 1);
    this.addEditorElement({
      id,
      name,
      type: 'audio',
      placement: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      row,
      from: 1,
      content: 'Upbeat Corporate',
      left: 0,
      top: 0,
      isDragging: false,
      duration: durationMs,
      timeFrame: {
        start: startTime,
        end: startTime + durationMs,
      },
      properties: {
        ...properties,
        elementId: `audio-${id}`,
        src: audioSrc,
        audioType: audioType,
        autoSubtitles: autoSubtitles,
        text: text,
      },
    });

    this.refreshElements();

    return true;
  }

  async addExistingVideo({
    src,
    id,
    name,
    row,
    startTime = 0,
    duration,
    width,
    height,
    placement,
    properties,
    timeFrame,
  }) {
    return new Promise((resolve, reject) => {
      const videoElement = document.createElement('video');
      videoElement.preload = 'auto';
      videoElement.playsInline = true;
      videoElement.muted = true;
      videoElement.crossOrigin = 'anonymous';
      videoElement.src = src;
      videoElement.style.display = 'none';
      videoElement.controls = true;
      videoElement.id = properties?.elementId || `video-${id}`;
      document.body.appendChild(videoElement);

      videoElement.onloadedmetadata = () => {
        try {

          this.videos.push({
            element: videoElement,
            id: id,
            url: src,
            name: name,
            duration: duration,
            thumbnails: properties?.thumbnails || [],
          });


          const fabricVideo = new fabric.VideoImage(videoElement, {
            left: placement?.x || 0,
            top: placement?.y || 0,
            width: placement?.width || videoElement.videoWidth,
            height: placement?.height || videoElement.videoHeight,
            scaleX: placement?.scaleX || 1,
            scaleY: placement?.scaleY || 1,
            angle: placement?.rotation || 0,
            selectable: true,
            objectCaching: false,
            lockUniScaling: false,
            hasControls: true,
            hasBorders: true,
            type: 'video',
          });


          const editorElement = {
            id: id,
            name: name,
            type: 'video',
            placement: placement || {
              x: 0,
              y: 0,
              width: videoElement.videoWidth,
              height: videoElement.videoHeight,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
            },
            timeFrame: timeFrame || {
              start: startTime,
              end: startTime + duration,
            },
            properties: {
              elementId: properties?.elementId || `video-${id}`,
              src: src,
              effect: properties?.effect || { type: 'none' },
              width: width || videoElement.videoWidth,
              height: height || videoElement.videoHeight,
              isInTimeline: true,
              thumbnails: properties?.thumbnails || [],
              thumbnailDuration:
                properties?.thumbnailDuration ||
                duration / (properties?.thumbnails?.length || 1),
              duration: duration,
              ...properties,
            },
            fabricObject: fabricVideo,
            row: row,
            from: 0,
            isDragging: false,
          };


          runInAction(() => {
            this.editorElements.push(editorElement);
          });


          if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
            window.dispatchSaveTimelineState(this);
          }


          this.canvas.add(fabricVideo);
          this.canvas.requestRenderAll();


          this.maxRows = Math.max(this.maxRows, row + 1);

          resolve(editorElement);
        } catch (error) {
          console.error('Error adding existing video:', error);
          reject(error);
        }
      };

      videoElement.onerror = error => {
        console.error('Video failed to load:', error);
        reject(error);
      };
    });
  }

  updateAudio({ sentenceId }) {
    const audioElement = this.editorElements.find(
      el => el.type === 'audio' && el.sentenceId === sentenceId
    );

    if (!audioElement) {
      return;
    }

    this.removeEditorElement(audioElement);
  }

  async loadAudioFromUrl(url) {
    try {
      const audio = new Audio();
      audio.src = url;

      return new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => {
          const audioElement = {
            id: getUid(),
            type: 'audio',
            source: audio,
            properties: {
              volume: 1,
              startTime: 0,
              endTime: audio.duration * 1000,
              row: 0,
            },
          };

          this.addAudioResource(audioElement);
          this.editorElements.push(audioElement);
          resolve(audioElement);
        };

        audio.onerror = () => {
          reject(new Error('Failed to load audio from URL'));
        };
      });
    } catch (error) {
      console.error('Error loading audio:', error);
      throw error;
    }
  }

  addText({
    text,
    fontSize = 86,
    fontWeight = '400',
    fontStyle = 'normal',
    startTime,
    endTime,
    imageId,
    pointId,
    sentence,
    point,
    font = 'Bangers',
    backgroundColor = '#000000',
    backgroundOpacity = 0,
    stroke = 0,
    strokeColor = '#000000',
    color = '#ffffff',
    synchronize = true,
    textAlign = 'center',
    verticalAlign = 'center',
    isExisting = false,
    timelineOnly = false,
  }) {
    const id = getUid();
    const index = this.editorElements.length;
    this.addEditorElement({
      id,
      imageId,
      pointId,
      name: `Text ${index + 1}`,
      type: 'text',
      sentence,
      point,
      placement: {
        x: this.canvas.width / 2,
        y: this.canvas.height / 2,
        width: 900,
        height: 100,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      timeFrame: {
        start: startTime,
        end: endTime,
      },
      row: 1,
      from: 0,
      content: 'Upbeat Corporate',
      left: 0,
      top: 0,
      isDragging: false,
      initialState: {
        scaleX: 1,
        scaleY: 1,
        left: this.canvas.width / 2,
        top: this.canvas.height / 2,
        opacity: 1.0,
      },
      properties: {
        text: text,
        fontSize: fontSize,
        fontWeight: fontWeight,
        fontStyle: fontStyle,
        font: font,
        backgroundColor: backgroundColor,
        backgroundOpacity: backgroundOpacity,
        stroke: stroke ?? 12,
        strokeColor: strokeColor,
        color: color,
        synchronize: synchronize,
        textAlign: textAlign,
        verticalAlign: verticalAlign,
        opacity: 1,
        strokeOpacity: 1,
        timelineOnly,
        shadow: {
          color: '#000000',
          blur: 0,
          offsetX: 0,
          offsetY: 0,
          opacity: 1,
        },
      },
    });
  }

  async addSubtitles(segments, punctuation, row) {


    const hasElementsInFirstRow = this.editorElements.some(
      element => element.row === 0
    );


    if (hasElementsInFirstRow) {
      this.shiftRowsDown(0);
    }

    const textElements = segments.map((segment, index) => {
      const { text, start, end, words } = segment;
      const id = getUid();
      const elementIndex = this.editorElements.length;
      const segmentDuration = segment.duration || 0;
      const isLastSegment = index === segments.length - 1;


      const segmentEnd = isLastSegment
        ? this.lastElementEnd
        : end * 1000 + segmentDuration;

      return {
        id,
        name: `Text ${elementIndex + 1}`,
        type: 'text',
        subType: 'subtitles',
        placement: {
          x: this.canvas.width / 2,
          y: this.canvas.height / 2,
          width: 900,
          height: 100,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        timeFrame: {
          start: start * 1000 + segmentDuration,
          end: segmentEnd,
        },
        row: 0,
        from: 0,
        content: 'Upbeat Corporate',
        left: 0,
        top: 0,
        isDragging: false,
        properties: {
          styleId: '685f0f3f120221cb89adbf48',
          text: punctuation
            ? text
            : text.replaceAll('.', '').replaceAll(',', ''),
          originalText: text,
          fontSize: 106,
          fontWeight: '400',
          fontStyle: 'normal',
          font: 'Bangers',
          backgroundColor: '#00000000',
          backgroundOpacity: 0,
          backgroundRadius: 0,
          stroke: 12,
          strokeColor: '#000000',
          color: '#ffffff',
          synchronize: true,
          textAlign: 'center',
          verticalAlign: 'center',
          shadow: {
            color: '#000000',
            blur: 0,
            offsetX: 0,
            offsetY: 0,
            opacity: 1,
          },
          words: words
            ? words.map((word, wordIndex) => {
                const isLastWord =
                  isLastSegment && wordIndex === words.length - 1;

                const wordEnd = isLastWord
                  ? segmentEnd
                  : end * 1000 + segmentDuration;

                return {
                  ...word,
                  word: punctuation
                    ? word.word
                    : word.word.replaceAll('.', '').replaceAll(',', ''),
                  originalWord: word.word,
                  segmentStart: start,
                  start: word.start * 1000 + segmentDuration,
                  end: wordEnd,
                  wordEnd: word.end * 1000,
                };
              })
            : [],
          wordObjects: [],
        },
      };
    });


    this.editorElements = [...this.editorElements, ...textElements];


    requestAnimationFrame(() => {

      this.editorElements.forEach(element => {
        if (element.properties.wordObjects?.length > 0) {
          element.properties.wordObjects.forEach(obj => {
            if (obj && this.canvas.contains(obj)) {
              this.canvas.remove(obj);
            }
          });
          element.properties.wordObjects = [];
        }
      });


      textElements.forEach(element => {
        if (element.properties.words?.length > 0) {
          const wordAnimation = {
            id: `${element.id}-word-animation`,
            targetId: element.id,
            type: 'textWordAnimation',
            effect: 'in',
            duration: 500,
            properties: {},
          };
          this.animations.push(wordAnimation);
        }
      });


      this.refreshElements();
      this.refreshAnimations();


      if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
        window.dispatchSaveTimelineState(this);
      }
    });

    return true;
  }

  setSubtitlesOnCanvas({ subtitleParams, segments }) {
    const textElements = segments.map(segment => {
      return {
        id: segment.id,
        name: `Subtitle`,
        type: 'text',
        subType: 'subtitles',
        placement: {
          ...segment.placement,
        },
        timeFrame: {
          ...segment.timeFrame,
        },
        row: segment.row,
        from: segment.from,
        content: 'Upbeat Corporate',
        left: segment.left,
        top: segment.top,
        isDragging: false,
        properties: {
          ...subtitleParams,
          opacity: subtitleParams.opacity || 1,
          strokeOpacity: subtitleParams.strokeOpacity || 1,
          text: segment.properties.text,
          words: segment.properties.words,
          wordObjects: segment.properties.wordObjects,
        },
      };
    });

    this.editorElements = [...this.editorElements, ...textElements];


    requestAnimationFrame(() => {

      this.editorElements.forEach(element => {
        if (element.properties.wordObjects?.length > 0) {
          element.properties.wordObjects.forEach(obj => {
            if (obj && this.canvas.contains(obj)) {
              this.canvas.remove(obj);
            }
          });
          element.properties.wordObjects = [];
        }
      });


      textElements.forEach(element => {
        if (element.properties.words?.length > 0) {
          const wordAnimation = {
            id: `${element.id}-word-animation`,
            targetId: element.id,
            type: 'textWordAnimation',
            effect: 'in',
            duration: 500,
            properties: {},
          };
          this.animations.push(wordAnimation);
        }
      });


      this.refreshElements();
      this.refreshAnimations();
    });
  }

  setTextOnCanvas({ storyId, element }) {
    this.addEditorElement({
      ...element,
      storyId,
      name: `Text`,
      type: 'text',
    });
  }

  addTextOnCanvas({
    storyId,
    imageId,
    pointId,
    sentence,
    point,
    text,
    properties,
    timelineOnly,
    placement,
    timeFrame,
    row,
  }) {
    const id = uuidv4();
    const index = this.editorElements.length;
    this.addEditorElement({
      id,
      imageId,
      pointId,
      storyId,
      name: `Text ${index + 1}`,
      type: 'text',
      sentence,
      point,
      placement,
      timeFrame,
      row,
      from: 0,
      content: 'Upbeat Corporate',
      isDragging: false,
      initialState: {
        scaleX: placement?.scaleX || 1,
        scaleY: placement?.scaleY || 1,
        left: placement?.x || 0,
        top: placement?.y || 0,
        opacity: 1.0,
      },
      properties: {
        ...properties,
        timelineOnly,
      },
    });
  }

  removeAnimation(id) {

    this.clearGLTransitionCache();

    const animationToRemove = this.animations.find(
      animation => animation.id === id
    );


    if (this.animationTimeLine) {
      this.animationTimeLine.pause();
    }

    if (animationToRemove) {

      const targetIds =
        animationToRemove.targetIds ||
        (animationToRemove.targetId ? [animationToRemove.targetId] : []);
      const targetElements = this.editorElements.filter(
        el => targetIds.includes(el.id) && el.type !== 'animation'
      );


      this.animations = this.animations.filter(
        animation => animation.id !== id
      );


      this.editorElements = this.editorElements.filter(
        element => !(element.type === 'animation' && element.animationId === id)
      );


      targetIds.forEach(targetId => {
        const remainingAnimations = this.animations.filter(anim => {
          const animTargetIds =
            anim.targetIds || (anim.targetId ? [anim.targetId] : []);
          return animTargetIds.includes(targetId);
        });


        if (remainingAnimations.length === 0) {
          this.resetElementToInitialState(targetId);
        }
      });


      const hasRemainingAnimations = targetIds.some(targetId => {
        return this.animations.some(anim => {
          const animTargetIds =
            anim.targetIds || (anim.targetId ? [anim.targetId] : []);
          return animTargetIds.includes(targetId);
        });
      });

      if (hasRemainingAnimations) {
        this.refreshAnimations();
        return
      }
    } else {

      this.animations = this.animations.filter(
        animation => animation.id !== id
      );
      this.editorElements = this.editorElements.filter(
        element => !(element.type === 'animation' && element.animationId === id)
      );
    }

    this.refreshAnimations();
    this.refreshElements();


    this.optimizedCleanupEmptyRows();


    if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
      window.dispatchSaveTimelineState(this);
    }


    if (!this.isInitializing && !this.isUndoRedoOperation) {
    }
  }


  convertAnimationsToTimelineElements() {
    const animationElements = [];

    this.animations.forEach(animation => {
      if (animation.type === 'glTransition') {

        const fromElement = this.editorElements.find(
          el => el.id === animation.fromElementId && el.type !== 'animation'
        );
        const toElement = this.editorElements.find(
          el => el.id === animation.toElementId && el.type !== 'animation'
        );

        if (!fromElement || !toElement) return;


        let animationRow = this.findAvailableRowForGLTransition(
          fromElement,
          toElement
        );

        const animationElement = {
          id: `animation-${animation.id}`,
          animationId: animation.id,
          type: 'animation',
          targetId: animation.fromElementId,
          fromElementId: animation.fromElementId,
          toElementId: animation.toElementId,
          row: animationRow,
          timeFrame: {
            start: animation.startTime,
            end: animation.endTime,
          },
          properties: {
            animationType: 'glTransition',
            transitionType: animation.transitionType,
            displayName: `${animation.transitionType} Transition`,
            originalAnimation: animation,
            effectDirection: 'transition',
          },

          absoluteStart: animation.startTime,
          absoluteEnd: animation.endTime,
          effectDirection: 'transition',
          displayName: `${animation.transitionType} Transition`,
        };

        animationElements.push(animationElement);
        return;
      }


      const targetElement = this.editorElements.find(
        el => el.id === animation.targetId && el.type !== 'animation'
      );

      if (!targetElement) return;

      const properties = animation.properties || {};
      let startTime = properties.startTime || 0;
      let endTime = properties.endTime || animation.duration || 1000;


      if (animation.type.endsWith('Out') && startTime === 0) {
        const elementDuration =
          targetElement.timeFrame.end - targetElement.timeFrame.start;
        const animationDuration = endTime - startTime;
        startTime = Math.max(0, elementDuration - animationDuration);
        endTime = startTime + animationDuration;
      }


      const absoluteStart = targetElement.timeFrame.start + startTime;
      const absoluteEnd = Math.min(
        targetElement.timeFrame.start + endTime,
        targetElement.timeFrame.end
      );


      let effectDirection = 'in';
      if (animation.type === 'zoomEffect') {
        const initialScale =
          properties.scaleFactor || properties.initialScale || 1.0;
        const targetScale =
          properties.targetScale || properties.endScale || 2.0;
        effectDirection = initialScale < targetScale ? 'in' : 'out';
      } else if (animation.type === 'fadeEffect') {
        const initialOpacity =
          properties.opacity || properties.initialOpacity || 1.0;
        const targetOpacity =
          properties.targetOpacity || properties.endOpacity || 0.0;
        effectDirection = initialOpacity < targetOpacity ? 'in' : 'out';
      }


      const baseType = animation.type.replace(/In$|Out$|Effect$/, '');
      const capitalizedType =
        baseType.charAt(0).toUpperCase() + baseType.slice(1);
      let displayName;

      if (animation.type.endsWith('Effect')) {
        displayName = `${capitalizedType} ${
          effectDirection === 'in'
            ? 'In'
            : effectDirection === 'out'
            ? 'Out'
            : 'Effect'
        }`;
      } else if (animation.type.endsWith('In')) {
        displayName = `${capitalizedType} In`;
      } else if (animation.type.endsWith('Out')) {
        displayName = `${capitalizedType} Out`;
      } else {
        displayName = `${capitalizedType} Effect`;
      }


      let animationRow = this.findAvailableAnimationRow();

      const animationElement = {
        id: `animation-${animation.id}`,
        animationId: animation.id,
        type: 'animation',
        targetId: animation.targetId,
        targetIds:
          animation.targetIds ||
          (animation.targetId ? [animation.targetId] : []),
        row: animationRow,
        timeFrame: {
          start: absoluteStart,
          end: absoluteEnd,
        },
        properties: {
          animationType: animation.type,
          effectDirection: effectDirection,
          displayName: displayName,
          originalAnimation: animation,
        },

        absoluteStart,
        absoluteEnd,
        effectDirection,
        displayName,
      };

      animationElements.push(animationElement);
    });

    return animationElements;
  }


  getDynamicTargetIds(animationRow, animationTimeFrame = null) {

    let targetElements = this.editorElements.filter(
      el =>
        el.type !== 'animation' &&
        el.type !== 'transition' &&
        el.row > animationRo
    );


    if (animationTimeFrame) {
      const animStart = animationTimeFrame.start;
      const animEnd = animationTimeFrame.end;

      targetElements = targetElements.filter(el => {
        if (!el.timeFrame) return false;


        const elementStart = el.timeFrame.start;
        const elementEnd = el.timeFrame.end;


        const intersects = elementStart < animEnd && elementEnd > animStart;

        return intersects;
      });
    }

    return targetElements.map(el => el.id);
  }



  resolveGLTargets(animationRow, animationTimeFrame) {
    if (!animationTimeFrame) return [];


    const candidates = this.editorElements.filter(
      el =>
        (el.type === 'imageUrl' || el.type === 'video') &&
        el.row > animationRow &&
        el.timeFrame &&
        el.timeFrame.start < animationTimeFrame.end &&
        el.timeFrame.end > animationTimeFrame.start
    );

    if (candidates.length === 0) return [];


    const covering = candidates.find(
      el =>
        el.timeFrame.start <= animationTimeFrame.start &&
        el.timeFrame.end >= animationTimeFrame.end
    );
    if (covering) {
      return [covering.id, covering.id];
    }


    const pickForTime = targetTime => {

      const containing = candidates.filter(
        el => el.timeFrame.start <= targetTime && el.timeFrame.end >= targetTime
      );
      if (containing.length > 0) {
        containing.sort(
          (a, b) =>
            Math.abs(targetTime - (a.timeFrame.start + a.timeFrame.end) / 2) -
            Math.abs(targetTime - (b.timeFrame.start + b.timeFrame.end) / 2)
        );
        return containing[0];
      }

      const withDistance = candidates.map(el => {
        const dist =
          el.timeFrame.end < targetTime
            ? targetTime - el.timeFrame.end
            : el.timeFrame.start - targetTime;
        return { el, dist: Math.max(0, dist) };
      });
      withDistance.sort((a, b) => a.dist - b.dist);
      return withDistance[0]?.el || null;
    };

    const startEl = pickForTime(animationTimeFrame.start);
    const endEl = pickForTime(animationTimeFrame.end);

    if (startEl && endEl) {
      if (startEl.id === endEl.id) return [startEl.id, startEl.id];
      return [startEl.id, endEl.id];
    }


    const first = startEl || endEl || candidates[0];
    if (!first) return [];
    return [first.id, first.id];
  }


  resetElementToInitialState = action(elementId => {
    const element = this.editorElements.find(el => el.id === elementId);
    if (!element || !element.fabricObject || !element.initialState) return;

    const fabricObject = element.fabricObject;
    const initialState = element.initialState;


    fabricObject.set({
      scaleX: initialState.scaleX,
      scaleY: initialState.scaleY,
      left: initialState.left,
      top: initialState.top,
      opacity: initialState.opacity,
    });

    fabricObject.setCoords();
    this.canvas?.renderAll();
  });


  resetCompletedAnimations = action(currentTime => {

    const animationsByTarget = {};

    this.animations.forEach(animation => {
      if (animation.type === 'glTransition') return

      const targetIds =
        animation.targetIds || (animation.targetId ? [animation.targetId] : []);

      targetIds.forEach(targetId => {
        if (!animationsByTarget[targetId]) {
          animationsByTarget[targetId] = [];
        }
        animationsByTarget[targetId].push(animation);
      });
    });


    Object.keys(animationsByTarget).forEach(targetId => {
      const element = this.editorElements.find(el => el.id === targetId);
      if (!element || !element.fabricObject) return;

      const animations = animationsByTarget[targetId];
      const hasActiveAnimations = animations.some(animation => {
        const animationStart = this.getAnimationStartTime(
          animation,
          element,
          element.timeFrame.start
        );
        const animationEnd = this.getAnimationEndTime(
          animation,
          element,
          element.timeFrame.end
        );

        return currentTime >= animationStart && currentTime <= animationEnd;
      });


      if (!hasActiveAnimations) {

        const initialState = element.initialState;
        if (initialState) {
          const fabricObject = element.fabricObject;
          const needsReset =
            Math.abs(fabricObject.scaleX - initialState.scaleX) > 0.001 ||
            Math.abs(fabricObject.scaleY - initialState.scaleY) > 0.001 ||
            Math.abs(fabricObject.left - initialState.left) > 0.1 ||
            Math.abs(fabricObject.top - initialState.top) > 0.1 ||
            Math.abs(fabricObject.opacity - initialState.opacity) > 0.001;

          if (needsReset) {
            this.resetElementToInitialState(targetId);
          }
        }
      }
    });
  });


  applyAnimationToAllOnSameRow = action((selectedElementId, animationType) => {
    const selectedElement = this.editorElements.find(
      el => el.id === selectedElementId
    );
    if (!selectedElement) {
      console.warn(`Selected element ${selectedElementId} not found`);
      return;
    }

    const selectedRow = selectedElement.row;


    const otherElementsOnSameRow = this.editorElements.filter(
      el =>
        el.row === selectedRow &&
        el.type !== 'animation' &&
        el.type !== 'transition' &&
        (el.type === 'imageUrl' || el.type === 'video') &
        el.id !== selectedElementI
    );


    const selectedElementAnimations = this.animations.filter(anim => {
      const targetIds =
        anim.targetIds || (anim.targetId ? [anim.targetId] : []);
      return (
        targetIds.includes(selectedElementId) && anim.type === animationType
      );
    });

    if (selectedElementAnimations.length === 0) {
      console.warn(
        `No animations of type ${animationType} found for selected element`
      );
      return;
    }


    selectedElementAnimations.forEach(sourceAnimation => {

      const animationsToRemove = this.animations.filter(anim => {
        if (anim.type !== animationType) return false;
        const targetIds =
          anim.targetIds || (anim.targetId ? [anim.targetId] : []);
        return otherElementsOnSameRow.some(el => targetIds.includes(el.id));
      });

      animationsToRemove.forEach(anim => {
        this.removeAnimation(anim.id);
      });


      otherElementsOnSameRow.forEach(targetElement => {

        const elementDuration =
          targetElement.timeFrame.end - targetElement.timeFrame.start;
        const animationDuration = sourceAnimation.duration || 1000;


        const selectedElementDuration =
          selectedElement.timeFrame.end - selectedElement.timeFrame.start;
        const originalAnimationProperties = sourceAnimation.properties || {};


        let originalRelativeStart = 0;
        let originalRelativeEnd = 1;

        if (
          originalAnimationProperties.absoluteStart !== undefined &&
          originalAnimationProperties.absoluteEnd !== undefined
        ) {

          const originalAbsoluteStart =
            originalAnimationProperties.absoluteStart -
            selectedElement.timeFrame.start;
          const originalAbsoluteEnd =
            originalAnimationProperties.absoluteEnd -
            selectedElement.timeFrame.start;
          originalRelativeStart = Math.max(
            0,
            originalAbsoluteStart / selectedElementDuration
          );
          originalRelativeEnd = Math.min(
            1,
            originalAbsoluteEnd / selectedElementDuration
          );
        } else {

          const originalStartTime = originalAnimationProperties.startTime || 0;
          const originalEndTime =
            originalAnimationProperties.endTime || animationDuration;
          originalRelativeStart = originalStartTime / selectedElementDuration;
          originalRelativeEnd = originalEndTime / selectedElementDuration;
        }


        const newStartTime = originalRelativeStart * elementDuration;
        const newEndTime = originalRelativeEnd * elementDuration;
        const newDuration = newEndTime - newStartTime;

        const newAnimation = {
          id: `${animationType}-${
            targetElement.id
          }-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: sourceAnimation.type,
          duration: newDuration,
          effect: sourceAnimation.effect,
          effectVariant: sourceAnimation.effectVariant,
          targetIds: [targetElement.id],
          properties: {
            ...sourceAnimation.properties,
            startTime: newStartTime,
            endTime: newEndTime,

            absoluteStart: undefined,
            absoluteEnd: undefined,
          },
          syncToAllScenes: sourceAnimation.syncToAllScenes,
        };


        this.addAnimation(newAnimation);
      });
    });
  });


  removeAllAnimationsFromElement = action(elementId => {
    const animationsToRemove = this.animations.filter(anim => {
      const targetIds =
        anim.targetIds || (anim.targetId ? [anim.targetId] : []);
      return targetIds.includes(elementId) && anim.type !== 'glTransition';
    });

    animationsToRemove.forEach(anim => {
      this.removeAnimation(anim.id);
    });
  });


  removeAllAnimationsFromRow = action(selectedElementId => {
    const selectedElement = this.editorElements.find(
      el => el.id === selectedElementId
    );
    if (!selectedElement) {
      console.warn(`Selected element ${selectedElementId} not found`);
      return;
    }

    const selectedRow = selectedElement.row;


    const allElementsOnSameRow = this.editorElements.filter(
      el =>
        el.row === selectedRow &&
        el.type !== 'animation' &&
        el.type !== 'transition' &&
        (el.type === 'imageUrl' || el.type === 'video'),
    );


    const animationsToRemove = this.animations.filter(anim => {
      if (anim.type === 'glTransition') return false
      const targetIds =
        anim.targetIds || (anim.targetId ? [anim.targetId] : []);
      return allElementsOnSameRow.some(el => targetIds.includes(el.id));
    });

    animationsToRemove.forEach(anim => {
      this.removeAnimation(anim.id);
    });
  });


  validateAndUpdateAnimationTargets = action((animationId, animationRow) => {
    const animationIndex = this.animations.findIndex(
      anim => anim.id === animationId
    );
    if (animationIndex === -1) return;

    const animation = this.animations[animationIndex];
    const currentTargetIds = animation.targetIds || [];


    const validCurrentTargets = currentTargetIds.filter(targetId => {
      const targetElement = this.editorElements.find(el => el.id === targetId);
      return targetElement && targetElement.row > animationRow;
    });


    const animationElement = this.editorElements.find(
      el => el.type === 'animation' && el.animationId === animationId
    );
    const animationTimeFrame = animationElement
      ? animationElement.timeFrame
      : null;


    const newPotentialTargets = this.getDynamicTargetIds(
      animationRow,
      animationTimeFrame
    );


    let finalTargetIds = [
      ...new Set([...validCurrentTargets, ...newPotentialTargets]),
    ];



    if (finalTargetIds.length === 0 && currentTargetIds.length > 0) {
      finalTargetIds = currentTargetIds;
    }

    const invalidTargets = currentTargetIds.filter(
      id => !validCurrentTargets.includes(id)
    );


    if (animation.type !== 'glTransition') {
      invalidTargets.forEach(targetId => {
        this.resetElementToInitialState(targetId);
      });
    }


    this.animations[animationIndex] = {
      ...animation,
      targetIds: finalTargetIds,
      row: animationRow,
    };


    if (animation.type === 'glTransition') {
      if (finalTargetIds.length > 0) {
        this.animations[animationIndex].fromElementId = finalTargetIds[0];
        this.animations[animationIndex].toElementId =
          finalTargetIds.length > 1 ? finalTargetIds[1] : finalTargetIds[0];
      } else {
        this.animations[animationIndex].fromElementId = null;
        this.animations[animationIndex].toElementId = null;
      }


      if (
        finalTargetIds.length > 0 &&
        finalTargetIds.join(',') !== currentTargetIds.join(',')
      ) {
        const fromElement = this.editorElements.find(
          el => el.id === this.animations[animationIndex].fromElementId
        );
        const toElement = this.editorElements.find(
          el => el.id === this.animations[animationIndex].toElementId
        );

        if (fromElement && toElement) {
          this.setupGLTransitionRenderer(
            animationId,
            fromElement,
            toElement,
            animation.transitionType
          );
        }
      }
    }


    if (animationElement) {
      const animationElementIndex = this.editorElements.findIndex(
        el => el.id === animationElement.id
      );
      if (animationElementIndex !== -1) {
        this.editorElements[animationElementIndex].targetIds = finalTargetIds;


        if (animation.type === 'glTransition' && finalTargetIds.length > 0) {
          this.editorElements[animationElementIndex].fromElementId =
            finalTargetIds[0];
          this.editorElements[animationElementIndex].toElementId =
            finalTargetIds.length > 1 ? finalTargetIds[1] : finalTargetIds[0];
        }
      }
    }

    this.scheduleAnimationRefresh();
  });


  revalidateAllAnimationTargets = action(() => {
    this.animations.forEach(animation => {
      if (animation.type !== 'glTransition' && animation.row !== undefined) {
        this.validateAndUpdateAnimationTargets(animation.id, animation.row);
      }
    });
  });


  revalidateGLTransitions = action(() => {
    const glTransitions = this.animations.filter(
      anim => anim.type === 'glTransition'
    );

    glTransitions.forEach(transition => {
      const transitionElement = this.editorElements.find(
        el => el.type === 'animation' && el.animationId === transition.id
      );

      if (transitionElement) {

        const currentTimeFrame = transitionElement.timeFrame;
        const newTargetIds = this.resolveGLTargets(
          transitionElement.row,
          currentTimeFrame
        );

        const oldTargetIds = transition.targetIds || [];
        const hasTargetChanges =
          JSON.stringify(oldTargetIds.sort()) !==
          JSON.stringify(newTargetIds.sort());

        if (hasTargetChanges) {

          const transitionIndex = this.animations.findIndex(
            a => a.id === transition.id
          );
          if (transitionIndex !== -1) {
            this.animations[transitionIndex].targetIds = newTargetIds;


            if (newTargetIds.length > 0) {
              this.animations[transitionIndex].fromElementId = newTargetIds[0];
              this.animations[transitionIndex].toElementId =
                newTargetIds.length > 1 ? newTargetIds[1] : newTargetIds[0];
            } else {
              this.animations[transitionIndex].fromElementId = null;
              this.animations[transitionIndex].toElementId = null;
            }


            const elementIndex = this.editorElements.findIndex(
              el => el.id === transitionElement.id
            );
            if (elementIndex !== -1) {
              this.editorElements[elementIndex].targetIds = newTargetIds;
              if (newTargetIds.length > 0) {
                this.editorElements[elementIndex].fromElementId =
                  newTargetIds[0];
                this.editorElements[elementIndex].toElementId =
                  newTargetIds.length > 1 ? newTargetIds[1] : newTargetIds[0];
              }
            }


            if (newTargetIds.length > 0) {
              const fromElement = this.editorElements.find(
                el => el.id === newTargetIds[0]
              );
              const toElement = this.editorElements.find(el =>
                el.id === newTargetIds.length > 1
                  ? newTargetIds[1]
                  : newTargetIds[0]
              );

              if (fromElement && toElement) {
                this.setupGLTransitionRenderer(
                  transition.id,
                  fromElement,
                  toElement,
                  transition.transitionType
                );
              }
            } else {

              const glTransitionElement = this.glTransitionElements.get(
                transition.id
              );
              if (glTransitionElement && glTransitionElement.fabricObject) {
                glTransitionElement.fabricObject.set('opacity', 0);
              }
            }
          }
        }
      }
    });


    if (glTransitions.length > 0) {
      this.canvas?.requestRenderAll();
    }
  });


  updateAnimationTargets = action((animationId, newRow) => {
    const animationIndex = this.animations.findIndex(
      anim => anim.id === animationId
    );
    if (animationIndex === -1) {
      console.warn(`Animation with id ${animationId} not found`);
      return;
    }

    const animation = this.animations[animationIndex];
    const oldTargetIds = animation.targetIds || [];


    const animationElement = this.editorElements.find(
      el => el.type === 'animation' && el.animationId === animationId
    );
    const animationTimeFrame = animationElement
      ? animationElement.timeFrame
      : null;

    const newTargetIds = this.getDynamicTargetIds(newRow, animationTimeFrame);


    oldTargetIds.forEach(targetId => {
      this.resetElementToInitialState(targetId);
    });


    this.animations[animationIndex] = {
      ...animation,
      targetIds: newTargetIds,
      row: newRow
    };

    this.scheduleAnimationRefresh();
  });


  findAvailableAnimationRow() {
    const animationElements = this.editorElements.filter(
      el => el.type === 'animation'
    );
    const usedRows = new Set(animationElements.map(el => el.row));


    for (let row = 0; row < this.maxRows + 10; row++) {
      if (!usedRows.has(row)) {

        const hasOtherElements = this.editorElements.some(
          el => el.row === row && el.type !== 'animation'
        );

        if (!hasOtherElements) {
          return row;
        }
      }
    }


    return this.maxRows;
  }


  findAvailableRowForGLTransition(fromElement, toElement) {

    const imageRows = [fromElement.row, toElement.row];
    const minImageRow = Math.min(...imageRows);


    const gapStart = fromElement.timeFrame.end;
    const gapEnd = toElement.timeFrame.start;
    const gapDuration = gapEnd - gapStart;



    const transitionDuration = 1000;

    let transitionStart, transitionEnd;

    if (gapDuration === 0) {

      const transitionPoint = gapStart;
      const beforeRatio = 0.6;
      const afterRatio = 0.4;
      transitionStart = transitionPoint - transitionDuration * beforeRatio;
      transitionEnd = transitionPoint + transitionDuration * afterRatio;
    } else if (gapDuration >= transitionDuration) {

      const gapCenter = gapStart + gapDuration / 2;
      transitionStart = gapCenter - transitionDuration / 2;
      transitionEnd = gapCenter + transitionDuration / 2;
    } else {

      const gapCenter = gapStart + gapDuration / 2;
      transitionStart = gapCenter - transitionDuration / 2;
      transitionEnd = gapCenter + transitionDuration / 2;
    }


    for (let row = minImageRow - 1; row >= 0; row--) {

      const rowElements = this.editorElements.filter(el => el.row === row);
      const hasConflicts = rowElements.some(el => {

        return (
          el.timeFrame.start < transitionEnd &&
          el.timeFrame.end > transitionStart
        );
      });

      if (!hasConflicts) {
        return row;
      }
    }



    this.shiftRowsDown(minImageRow);


    return minImageRow;
  }


  syncAnimationsWithTimeline() {

    return;
  }


  moveAnimationElement(animationElementId, newTimeFrame) {
    const animationElement = this.editorElements.find(
      el => el.id === animationElementId && el.type === 'animation'
    );

    if (!animationElement) return;

    const originalAnimation = this.animations.find(
      anim => anim.id === animationElement.animationId
    );

    if (!originalAnimation) return;

    const targetElement = this.editorElements.find(
      el => el.id === originalAnimation.targetId && el.type !== 'animation'
    );

    if (!targetElement) return;


    const relativeStart = newTimeFrame.start - targetElement.timeFrame.start;
    const relativeEnd = newTimeFrame.end - targetElement.timeFrame.start;


    const elementDuration =
      targetElement.timeFrame.end - targetElement.timeFrame.start;
    const constrainedStart = Math.max(
      0,
      Math.min(relativeStart, elementDuration)
    );
    const constrainedEnd = Math.max(
      constrainedStart + 100,
      Math.min(relativeEnd, elementDuration)
    );


    const updatedAnimation = {
      ...originalAnimation,
      properties: {
        ...originalAnimation.properties,
        startTime: constrainedStart,
        endTime: constrainedEnd,
      },
      duration: constrainedEnd - constrainedStart,
    };

    this.updateAnimation(originalAnimation.id, updatedAnimation);


    animationElement.timeFrame = {
      start: targetElement.timeFrame.start + constrainedStart,
      end: targetElement.timeFrame.start + constrainedEnd,
    };
    animationElement.absoluteStart = animationElement.timeFrame.start;
    animationElement.absoluteEnd = animationElement.timeFrame.end;

    this.refreshElements();


    this.scheduleAnimationRefresh();
  }

  setSelectedElement(selectedElement) {
    const previousElement = this.selectedElement;
    this.selectedElement = selectedElement;


    if (selectedElement && selectedElement !== previousElement) {
      window.dispatchEvent(
        new CustomEvent('elementSelected', {
          detail: selectedElement,
        })
      );
    } else if (!selectedElement && previousElement) {
      window.dispatchEvent(
        new CustomEvent('elementDeselected', {
          detail: previousElement,
        })
      );
    }
    if (!selectedElement) {

      if (this.canvas) {
        if (selectedElement?.fabricObject) {
          this.canvas.discardActiveObject();
        } else {
          this.canvas.discardActiveObject();
        }
      }

      this.clearGuidelines();
    }
  }

  updateSelectedElement() {
    this.selectedElement =
      this.editorElements.find(
        element => element.id === this.selectedElement?.id
      ) || null;


    if (this.selectedElement?.fabricObject) {
      const fabricObject = this.selectedElement.fabricObject;
      const properties = this.selectedElement.properties;


      if (properties.fontSize)
        fabricObject.set('fontSize', properties.fontSize);
      if (properties.fontWeight)
        fabricObject.set('fontWeight', properties.fontWeight);
      if (properties.fontStyle)
        fabricObject.set('fontStyle', properties.fontStyle);
      if (properties.font) fabricObject.set('fontFamily', properties.font);
      if (properties.color) fabricObject.set('fill', properties.color);
      if (properties.textAlign)
        fabricObject.set('textAlign', properties.textAlign);

      fabricObject.setCoords();
      this.canvas.requestRenderAll();
    }
  }

  setCoppiedElements(selectedElements) {
    this.coppiedElements = selectedElements;
  }

  setSelectedElements(selectedElements) {
    this.selectedElements = selectedElements;
    if (this.canvas) {
      if (selectedElements && Object.keys(selectedElements).length > 0) {
        const liveFabricObjects = [];
        Object.keys(selectedElements).forEach(key => {
          const element = selectedElements[key];

          if (element && typeof element === 'object' && element.id) {

            if (
              element.type === 'animation' ||
              (typeof element.id === 'string' &&
                element.id.startsWith('animation-'))
            ) {
              return;
            }

            let liveFabricObject = null;

            if (
              element.fabricObject &&
              typeof element.fabricObject.get === 'function' &
              element.fabricObject.canvas === this.canvas
            ) {
              liveFabricObject = element.fabricObject;
            } else if (element.id) {
              const canvasObjects = this.canvas.getObjects();
              for (const canvasObj of canvasObjects) {
                if (canvasObj.id === element.id) {
                  liveFabricObject = canvasObj;
                  element.fabricObject = canvasObj
                  break;
                }
              }
            }

            if (liveFabricObject) {
              liveFabricObjects.push(liveFabricObject);
            } else {
              console.warn(
                `setSelectedElements: Could not find or verify live fabricObject for element id: ${element.id}.`
              );
            }
          }
        });

        if (liveFabricObjects.length > 0) {
          try {
            const selection = new fabric.ActiveSelection(liveFabricObjects, {
              canvas: this.canvas,
            });
            this.canvas.setActiveObject(selection);
          } catch (e) {
            console.error(
              'Error creating Fabric ActiveSelection:',
              e,
              liveFabricObjects
            );
            this.canvas.discardActiveObject();
          }
        } else {
          this.canvas.discardActiveObject();
        }
      } else {
        this.selectedElements = null;
        this.canvas.discardActiveObject();
      }
      this.canvas.requestRenderAll();
    }
  }

  removeSelectedElement() {
    this.setSelectedElement(null);
  }

  setEditorElements(editorElements) {
    this.editorElements = editorElements;
    this.updateSelectedElement();
    this.refreshElements();
    if (!this.isInitializing && !this.isUndoRedoOperation) {

      if (window.dispatchSaveTimelineState) {
        window.dispatchSaveTimelineState(this);
      }
    }
  }

  optimizedCleanupEmptyRows() {
    const rowCounts = new Map();
    let maxRow = 0;


    for (const element of this.editorElements) {
      rowCounts.set(element.row, (rowCounts.get(element.row) || 0) + 1);
      maxRow = Math.max(maxRow, element.row);
    }


    if (rowCounts.size === maxRow + 1) {
      this.maxRows = Math.max(3, maxRow + 1);
      return;
    }


    const rowMapping = new Map();
    let newRowNum = 0;

    for (let i = 0; i <= maxRow; i++) {
      if (rowCounts.has(i)) {
        rowMapping.set(i, newRowNum++);
      }
    }


    const elementsToUpdate = this.editorElements.filter(
      element => element.row !== rowMapping.get(element.row)
    );

    elementsToUpdate.forEach(element => {
      if (element.fabricObject && this.canvas.contains(element.fabricObject)) {
        this.canvas.remove(element.fabricObject);
      }
    });


    for (const element of this.editorElements) {
      const newRow = rowMapping.get(element.row);
      if (element.row !== newRow) {
        element.row = newRow;
      }
    }


    this.maxRows = Math.max(3, newRowNum);


    this.canvas?.discardActiveObject();
    this.canvas?.renderAll();


    setTimeout(() => {
      this.refreshElements();
      this.canvas?.renderAll();


      this.pendingUpdates.add('cleanupRows');
      this.debouncedRefreshElements();
    }, 0);
  }

  findFreeSpaceInRow(preferredStart, duration, rowElements) {
    if (rowElements.length === 0) {
      return { start: Math.min(preferredStart, this.maxTime - duration) };
    }


    rowElements.sort((a, b) => a.timeFrame.start - b.timeFrame.start);


    if (rowElements[0].timeFrame.start >= duration) {
      return { start: 0 };
    }


    let prevEnd = 0;
    for (const element of rowElements) {
      const gap = element.timeFrame.start - prevEnd;
      if (gap >= duration) {
        return { start: prevEnd };
      }
      prevEnd = element.timeFrame.end;
    }


    if (this.maxTime - prevEnd >= duration) {
      return { start: prevEnd };
    }

    return null;
  }

  shiftRowsDown = action((startFromRow, numberOfRows = 1) => {
    let maxRowUpdated = this.maxRows;


    const objectsToRemove = this.editorElements
      .filter(element => element.row >= startFromRow && element.fabricObject)
      .map(element => element.fabricObject);

    objectsToRemove.forEach(obj => {
      if (this.canvas.contains(obj)) {
        this.canvas.remove(obj);
      }
    });


    for (const element of this.editorElements) {
      if (element.row >= startFromRow) {
        element.row += numberOfRows;
        maxRowUpdated = Math.max(maxRowUpdated, element.row);
      }
    }


    this.maxRows = Math.max(1, maxRowUpdated + 1);


    this.canvas?.discardActiveObject();
    this.canvas?.renderAll();


    setTimeout(() => {
      this.refreshElements();
      this.canvas?.renderAll();

      runInAction(() => {

        this.pendingUpdates.add('shiftRows');
      });
      this.debouncedRefreshElements();
    }, 0);
  });

  pasteCoppiedElementsToNewRows(coppiedElements) {
    const elementsToAdd = [];


    const elementsByRow = new Map();
    coppiedElements.forEach(element => {
      if (!elementsByRow.has(element.row)) {
        elementsByRow.set(element.row, []);
      }
      elementsByRow.get(element.row).push(element);
    });


    const sortedRows = Array.from(elementsByRow.keys()).sort((a, b) => a - b);


    const numberOfNewRows = sortedRows.length;
    this.shiftRowsDown(0, numberOfNewRows);


    sortedRows.forEach((originalRow, index) => {
      const elementsInRow = elementsByRow.get(originalRow);
      const newRowIndex = index

      elementsInRow.forEach(elementToCopy => {
        if (!elementToCopy || !elementToCopy.timeFrame) return;


        const newPastedElement = {
          ...elementToCopy,
          id: uuidv4(),
          row: newRowIndex,
          timeFrame: {
            start: elementToCopy.timeFrame.start,
            end: elementToCopy.timeFrame.end,
          },
          selected: false,

          fabricObject: null,

          properties: elementToCopy.properties
            ? {
                ...elementToCopy.properties,

                elementId: elementToCopy.properties.elementId
                  ? `${elementToCopy.type}-${uuidv4()}`
                  : elementToCopy.properties.elementId,

                wordObjects: elementToCopy.properties.wordObjects
                  ? []
                  : undefined,
              }
            : undefined,
        };

        elementsToAdd.push(newPastedElement);
      });
    });


    runInAction(() => {
      if (numberOfNewRows > 0) {
        this.setMaxRows(this.maxRows + numberOfNewRows);
      }
      this.editorElements = [...elementsToAdd, ...this.editorElements];
    });


    requestAnimationFrame(() => {
      this.refreshElements()


      setTimeout(() => {
        this.updateVideoElements();
        this.updateAudioElements();


        if (this.canvas) {
          this.canvas.discardActiveObject();
          this.canvas.requestRenderAll();
        }
      }, 100)
    });

    if (!this.isInitializing && !this.isUndoRedoOperation) {
      this.saveToHistory();
    }
  }

  pasteCoppiedElements(coppiedElements) {
    const elementsToAdd = [];
    const rowLastPastedEndTime = new Map()
    const newlyClaimedRowTypesInBatch = new Map()

    const getElementType = element => {
      if (!element) return 'unknown';
      if (isEditorAudioElement(element)) return 'audio';
      if (isEditorVideoElement(element)) return 'video';
      if (isEditorImageElement(element)) return 'image';
      return 'unknown';
    };

    const findPlacementInSpaces = (spaces, duration, preferredStart) => {
      if (spaces && spaces.length > 0) {
        for (const space of spaces) {
          const potentialStartInSpace = Math.max(space.start, preferredStart);
          const potentialEndInSpace = potentialStartInSpace + duration;
          if (
            potentialEndInSpace <= space.end &&
            potentialEndInSpace - potentialStartInSpace >= duration
          ) {
            return { start: potentialStartInSpace, end: potentialEndInSpace };
          }
        }
      }
      return null;
    };

    const makeAndAddPastedElement = (elementToCopy, placement, targetRow) => {
      const newPastedElement = JSON.parse(JSON.stringify(elementToCopy));
      newPastedElement.id = uuidv4();
      newPastedElement.timeFrame = placement;
      newPastedElement.row = targetRow;

      if (typeof newPastedElement.selected !== 'undefined') {
        newPastedElement.selected = false;
      }

      elementsToAdd.push(newPastedElement);
      rowLastPastedEndTime.set(targetRow, placement.end);

      const mediaType = getElementType(elementToCopy);
      if (mediaType !== 'unknown') {
        newlyClaimedRowTypesInBatch.set(targetRow, mediaType);
      }
    };

    for (const elementToCopy of coppiedElements) {
      const originalElementIdForLogging = elementToCopy.id;
      const mediaType = getElementType(elementToCopy)

      if (
        !elementToCopy ||
        !elementToCopy.timeFrame ||
        typeof elementToCopy.timeFrame.start !== 'number' ||
        typeof elementToCopy.timeFrame.end !== 'number'
      ) {
        continue;
      }

      const originalRow = elementToCopy.row;
      const duration =
        elementToCopy.timeFrame.end - elementToCopy.timeFrame.start;

      if (typeof originalRow !== 'number') {
        continue;
      }

      if (duration <= 0) {
        continue;
      }

      let successfullyPasted = false;


      const preferredStartTimeOriginalRow =
        rowLastPastedEndTime.get(originalRow) || 0;

      if (
        !(
          newlyClaimedRowTypesInBatch.has(originalRow) &&
          newlyClaimedRowTypesInBatch.get(originalRow) !== mediaType
        )
      ) {
        const availableSpacesOriginalRow = this.findAvailableSpaces(
          originalRow,
          duration,
          null
        );
        let chosenPlacementOriginalRow = findPlacementInSpaces(
          availableSpacesOriginalRow,
          duration,
          preferredStartTimeOriginalRow
        );

        if (chosenPlacementOriginalRow) {
          makeAndAddPastedElement(
            elementToCopy,
            chosenPlacementOriginalRow,
            originalRow,
            duration,
            originalElementIdForLogging
          );

          if (mediaType !== 'unknown')
            newlyClaimedRowTypesInBatch.set(originalRow, mediaType);
          successfullyPasted = true;
        }
      }


      if (!successfullyPasted && mediaType !== 'unknown') {


        const candidateSameTypeRows = [];
        for (let r = 0; r < this.maxRows; r++) {
          if (r === originalRow) continue;


          const rowHasMatchingStoredElements = this.editorElements.some(
            el => el.row === r && getElementType(el) === mediaType
          );

          const rowIsBatchCompatible =
            !newlyClaimedRowTypesInBatch.has(r) ||
            newlyClaimedRowTypesInBatch.get(r) === mediaType;

          if (rowHasMatchingStoredElements && rowIsBatchCompatible) {
            candidateSameTypeRows.push(r);
          }
        }

        if (candidateSameTypeRows.length > 0) {
          for (const candidateRow of candidateSameTypeRows) {
            const preferredStartTimeCandidateRow =
              rowLastPastedEndTime.get(candidateRow) || 0;
            const availableSpacesCandidateRow = this.findAvailableSpaces(
              candidateRow,
              duration,
              null
            );
            let chosenPlacementCandidateRow = findPlacementInSpaces(
              availableSpacesCandidateRow,
              duration,
              preferredStartTimeCandidateRow
            );
            if (chosenPlacementCandidateRow) {
              makeAndAddPastedElement(
                elementToCopy,
                chosenPlacementCandidateRow,
                candidateRow,
                duration,
                originalElementIdForLogging
              );

              if (mediaType !== 'unknown')
                newlyClaimedRowTypesInBatch.set(candidateRow, mediaType);
              successfullyPasted = true;
              break;
            }
          }
        }
      }


      if (!successfullyPasted && mediaType !== 'unknown') {
        let targetNewRowIndex = this.maxRows;
        let safetyNet = 0;
        const maxSafetyChecks = 10;

        while (safetyNet < maxSafetyChecks && !successfullyPasted) {
          if (
            newlyClaimedRowTypesInBatch.has(targetNewRowIndex) &&
            newlyClaimedRowTypesInBatch.get(targetNewRowIndex) !== mediaType
          ) {
            targetNewRowIndex++;
            safetyNet++;
            continue;
          }

          const preferredStartTimeForNewRow =
            rowLastPastedEndTime.get(targetNewRowIndex) || 0;
          const availableSpacesForNewRow = this.findAvailableSpaces(
            targetNewRowIndex,
            duration,
            null
          );
          let chosenPlacementForNewRow = findPlacementInSpaces(
            availableSpacesForNewRow,
            duration,
            preferredStartTimeForNewRow
          );

          if (chosenPlacementForNewRow) {
            makeAndAddPastedElement(
              elementToCopy,
              chosenPlacementForNewRow,
              targetNewRowIndex,
              duration,
              originalElementIdForLogging
            );


            if (targetNewRowIndex >= this.maxRows) {
              runInAction(() => {
                if (targetNewRowIndex + 1 > this.maxRows) {
                  this.setMaxRows(targetNewRowIndex + 1);
                }
              });
            }
            successfullyPasted = true;
          } else {
            targetNewRowIndex++;
            safetyNet++;
          }
        }
      }
    }

    if (elementsToAdd.length > 0) {
      runInAction(() => {
        this.editorElements = [...this.editorElements, ...elementsToAdd];
      });

      requestAnimationFrame(() => {
        this.updateVideoElements();
        this.updateAudioElements();
        this.canvas?.requestRenderAll();
      });

      if (!this.isInitializing && !this.isUndoRedoOperation) {
        this.saveToHistory();
      }
    }
  }


  _groupDragThrottle = null;
  _pendingGroupUpdate = null;
  _isGroupDragging = false;

  moveSelectedElementsTimeFrame(
    selectedElements,
    timeFrameDelta,
    isImmediate = false
  ) {

    this._pendingGroupUpdate = { selectedElements, timeFrameDelta };


    if (!this._isGroupDragging) {
      this._isGroupDragging = true;

      this.addGroupDragClass(selectedElements);
    }


    if (isImmediate) {
      this._executePendingGroupUpdate();
      return;
    }


    if (this._groupDragThrottle) {
      return
    }


    this._groupDragThrottle = setTimeout(() => {
      this._executePendingGroupUpdate();
      this._groupDragThrottle = null;
    }, 8)
  }


  addGroupDragClass(selectedElements) {
    selectedElements.forEach(element => {
      const elementDOM = document.querySelector(
        `[data-overlay-id="${element.id}"]`
      );
      if (elementDOM) {
        elementDOM.classList.add('group-dragging');
      }
    });
  }


  removeGroupDragClass(selectedElements) {
    if (selectedElements) {
      selectedElements.forEach(element => {
        const elementDOM = document.querySelector(
          `[data-overlay-id="${element.id}"]`
        );
        if (elementDOM) {
          elementDOM.classList.remove('group-dragging');
        }
      });
    } else {

      document.querySelectorAll('.group-dragging').forEach(el => {
        el.classList.remove('group-dragging');
      });
    }
  }

  _executePendingGroupUpdate() {
    if (!this._pendingGroupUpdate) return;

    const { selectedElements, timeFrameDelta } = this._pendingGroupUpdate;
    const updates = new Map();


    const selectedIds = new Set(selectedElements.map(el => el.id));


    const nonSelectedElements = this.editorElements.filter(
      el => !selectedIds.has(el.id)
    );


    const selectedByRow = new Map();
    selectedElements.forEach(el => {
      if (!selectedByRow.has(el.row)) {
        selectedByRow.set(el.row, []);
      }
      selectedByRow.get(el.row).push(el);
    });


    const rowDistances = [];

    selectedByRow.forEach((rowSelectedElements, row) => {
      const rowStart = Math.min(
        ...rowSelectedElements.map(el => el.timeFrame.start)
      );
      const rowEnd = Math.max(
        ...rowSelectedElements.map(el => el.timeFrame.end)
      );


      const rowElements = nonSelectedElements.filter(el => el.row === row);


      const leftElements = rowElements.filter(
        el => el.timeFrame.end <= rowStart
      );
      const rightElements = rowElements.filter(
        el => el.timeFrame.start >= rowEnd
      );


      const leftDistance =
        leftElements.length > 0
          ? rowStart - Math.max(...leftElements.map(el => el.timeFrame.end))
          : rowStart;
      const rightDistance =
        rightElements.length > 0
          ? Math.min(...rightElements.map(el => el.timeFrame.start)) - rowEnd
          : Infinity;

      rowDistances.push({ row, leftDistance, rightDistance });
    });


    const shortestLeftDistance = Math.min(
      ...rowDistances.map(rd => rd.leftDistance)
    );
    const shortestRightDistance = Math.min(
      ...rowDistances.map(rd => rd.rightDistance)
    );


    let actualDelta = timeFrameDelta;
    if (timeFrameDelta < 0) {

      actualDelta = Math.max(timeFrameDelta, -shortestLeftDistance + 10);
    } else {

      actualDelta = Math.min(timeFrameDelta, shortestRightDistance);
    }


    selectedElements.forEach(element => {
      const newTimeFrame = {
        start: element.timeFrame.start + actualDelta,
        end: element.timeFrame.end + actualDelta,
      };

      updates.set(element.id, {
        ...element,
        timeFrame: newTimeFrame,
      });
    });


    if (updates.size > 0) {
      runInAction(() => {
        this.editorElements = this.editorElements.map(
          el => updates.get(el.id) || el
        );
      });



      if (!this._isGroupDragging || this._pendingGroupUpdate === null) {

        Promise.resolve().then(() => {
          this.updateVideoElements();
          this.updateAudioElements();

          if (!this._isGroupDragging) {
            this.canvas?.requestRenderAll();
          }
        });
      }
    }


    this._pendingGroupUpdate = null;
  }


  endGroupDrag() {
    if (!this._isGroupDragging) return;

    this._isGroupDragging = false;


    this.removeGroupDragClass();


    if (this._pendingGroupUpdate) {
      this.moveSelectedElementsTimeFrame(
        this._pendingGroupUpdate.selectedElements,
        this._pendingGroupUpdate.timeFrameDelta,
        true
      );
    }


    if (this._groupDragThrottle) {
      clearTimeout(this._groupDragThrottle);
      this._groupDragThrottle = null;
    }


    requestAnimationFrame(() => {
      this.updateVideoElements();
      this.updateAudioElements();
      this.canvas?.requestRenderAll();
    });
  }


  findAvailableSpaces(row, minDuration, excludeElementId) {
    const elementsInRow = this.editorElements
      .filter(el => el.row === row && el.id !== excludeElementId)
      .sort((a, b) => a.timeFrame.start - b.timeFrame.start);

    const availableSpaces = [];


    if (elementsInRow.length === 0) {
      availableSpaces.push({
        start: 0,
        end: this.maxTime,
      });
      return availableSpaces;
    }


    if (elementsInRow[0].timeFrame.start > minDuration) {
      availableSpaces.push({
        start: 0,
        end: elementsInRow[0].timeFrame.start,
      });
    }


    for (let i = 0; i < elementsInRow.length - 1; i++) {
      const spaceStart = elementsInRow[i].timeFrame.end;
      const spaceEnd = elementsInRow[i + 1].timeFrame.start;

      if (spaceEnd - spaceStart >= minDuration) {
        availableSpaces.push({
          start: spaceStart,
          end: spaceEnd,
        });
      }
    }


    const lastElement = elementsInRow[elementsInRow.length - 1];
    if (this.maxTime - lastElement.timeFrame.end >= minDuration) {
      availableSpaces.push({
        start: lastElement.timeFrame.end,
        end: this.maxTime,
      });
    }

    return availableSpaces;
  }

  endMove() {

    this.endGroupDrag();

    if (this.moveState.isMoving) {
      this.moveState.isMoving = false;
      if (this.moveState.rafId) {
        cancelAnimationFrame(this.moveState.rafId);
        this.moveState.rafId = null;
      }
      this.moveState.accumulatedMoves.clear();
      this.refreshAnimations();
      this.refreshElements();


      if (window.dispatchSaveTimelineState) {
        window.dispatchSaveTimelineState(this);
      }
    }
  }

  processDragUpdate() {
    const now = performance.now();
    const timeSinceLastUpdate = now - this.dragState.lastUpdateTime;


    if (timeSinceLastUpdate < this.dragState.updateInterval) {
      this.dragState.rafId = requestAnimationFrame(() =>
        this.processDragUpdate()
      );
      return;
    }

    const MIN_DURATION = 100;
    const updates = new Map();
    const processedElements = new Set();


    for (const [id, { element, timeFrame }] of this.dragState
      .accumulatedUpdates) {
      if (processedElements.has(id)) continue;
      processedElements.add(id);

      if (timeFrame.start !== undefined) {
        if (!this.shouldUpdatePosition(timeFrame.start)) {
          continue;
        }
      }


      const minDurationForType = element.type === 'audio' ? 1 : MIN_DURATION;

      const newTimeFrame = {
        start: Math.max(0, timeFrame.start ?? element.timeFrame.start),
        end: Math.min(this.maxTime, timeFrame.end ?? element.timeFrame.end),
      };

      if (newTimeFrame.end - newTimeFrame.start < minDurationForType) {
        if (timeFrame.start !== undefined) {
          newTimeFrame.end = newTimeFrame.start + minDurationForType;
        } else {
          newTimeFrame.start = newTimeFrame.end - minDurationForType;
        }
      }



      const preserveRow = element.type === 'video' || element.type === 'audio';
      const newElement = {
        ...element,
        timeFrame: newTimeFrame,
        row: element.row
      };
      updates.set(id, newElement);


      const overlappingElements = this.editorElements.filter(
        el =>
          el.id !== id &&
          el.row === element.row &
          newTimeFrame.start < el.timeFrame.end &&
          newTimeFrame.end > el.timeFrame.start
      );

      overlappingElements.forEach(el => {
        if (processedElements.has(el.id)) return;
        processedElements.add(el.id);

        const updatedEl = { ...el };
        if (timeFrame.start !== undefined) {
          if (el.timeFrame.end - newTimeFrame.start >= MIN_DURATION) {
            updatedEl.timeFrame = {
              ...updatedEl.timeFrame,
              end: newTimeFrame.start,
            };
          }
        } else if (timeFrame.end !== undefined) {
          if (newTimeFrame.end - el.timeFrame.start >= MIN_DURATION) {
            updatedEl.timeFrame = {
              ...updatedEl.timeFrame,
              start: newTimeFrame.end,
            };
          }
        }

        if (
          updatedEl.timeFrame.end - updatedEl.timeFrame.start >=
          MIN_DURATION
        ) {

          updates.set(el.id, {
            ...updatedEl,
            row: el.row,
          });
        }
      });
    }


    if (updates.size > 0) {
      runInAction(() => {
        this.editorElements = this.editorElements.map(
          el => updates.get(el.id) || el
        );
      });


      this.updateVideoElements();
      this.updateAudioElements();
      this.canvas?.requestRenderAll();
    }


    this.dragState.accumulatedUpdates.clear();
    this.dragState.lastUpdateTime = now;
    this.dragState.rafId = null;


    if (this.dragState.isDragging) {
      this.dragState.rafId = requestAnimationFrame(() =>
        this.processDragUpdate()
      );
    }
  }

  endDrag() {
    if (this.dragState.isDragging) {
      this.dragState.isDragging = false;
      if (this.dragState.rafId) {
        cancelAnimationFrame(this.dragState.rafId);
        this.dragState.rafId = null;
      }

      this.refreshAnimations();
      this.refreshElements();


      if (window.dispatchSaveTimelineState) {
        window.dispatchSaveTimelineState(this);
      }
    }
  }

  async removeEditorElements(idsToRemove) {


    runInAction(async () => {
      const elementsToRemove = [];
      for (const id of idsToRemove) {
        const element = this.editorElements.find(el => el.id === id);
        if (element) {
          elementsToRemove.push(element);
        }
      }


      const animationIdsToRemove = [];
      if (elementsToRemove.length === 0) {

        idsToRemove.forEach(id => {
          const anim = this.animations.find(a => a.id === id);
          if (anim) animationIdsToRemove.push(id);
        });
        if (animationIdsToRemove.length === 0) {
          return;
        }
      }

      for (const elementToRemove of elementsToRemove) {

        if (elementToRemove.fabricObject && this.canvas) {
          this.canvas.remove(elementToRemove.fabricObject);
          elementToRemove.fabricObject = null
        }


        if (elementToRemove.type === 'audio') {
          const audioElement = document.getElementById(
            elementToRemove.properties.elementId
          );
          if (audioElement) {
            audioElement.remove();
          }
        }

        this.shiftElementsAfterRemoval(elementToRemove);
      }


      try {
        const idsSet = new Set(idsToRemove);
        const animationsToRemove = this.animations.filter(anim => {
          const targetIds =
            anim.targetIds || (anim.targetId ? [anim.targetId] : []);
          const targetsHit = targetIds.some(tid => idsSet.has(tid));
          const glHit =
            anim.type === 'glTransition' &&
            (idsSet.has(anim.fromElementId) || idsSet.has(anim.toElementId));

          const timelineHit = idsSet.has(`animation-${anim.id}`);

          return targetsHit || glHit || timelineHit;
        });

        animationsToRemove.forEach(anim => {
          if (anim.type === 'glTransition') {
            this.removeGLTransition(anim.id);
          } else {
            this.removeAnimation(anim.id);
          }
        });
      } catch (e) {
        console.warn(
          'Error while removing linked animations during multi-delete',
          e
        );
      }


      if (animationIdsToRemove.length > 0) {
        animationIdsToRemove.forEach(animId => {
          const anim = this.animations.find(a => a.id === animId);
          if (!anim) return;
          if (anim.type === 'glTransition') {
            this.removeGLTransition(anim.id);
          } else {
            this.removeAnimation(anim.id);
          }
        });
      }


      const elementsBefore = this.editorElements.length;
      this.editorElements = this.editorElements.filter(
        element => !idsToRemove.includes(element.id)
      );
      const elementsAfter = this.editorElements.length;


      for (const elementToRemove of elementsToRemove) {

        let derivedAnimationId = elementToRemove.animationId;
        if (
          !derivedAnimationId &&
          typeof elementToRemove.id === 'string' &&
          elementToRemove.id.startsWith('animation-')
        ) {
          derivedAnimationId = elementToRemove.id.slice('animation-'.length);
        }
        if (
          !derivedAnimationId &&
          elementToRemove.properties?.originalAnimation?.id
        ) {
          derivedAnimationId = elementToRemove.properties.originalAnimation.id;
        }

        if (derivedAnimationId) {
          const animationIndex = this.animations.findIndex(
            anim => anim.id === derivedAnimationId
          );
          if (animationIndex !== -1) {
            const animation = this.animations[animationIndex];
            if (animation.type === 'glTransition') {
              this.removeGLTransition(animation.id);
            } else {
              this.animations.splice(animationIndex, 1);

              this.editorElements = this.editorElements.filter(
                el =>
                  !(
                    el.type === 'animation' && el.animationId === animation.id
                  ) && el.id !== `animation-${animation.id}`
              );
            }
          }
        }
      }


      this.refreshAnimations()
      this.refreshElements()
      this.optimizedCleanupEmptyRows();


      await Promise.resolve();

      if (!this.isUndoRedoOperation) {
        this.saveToHistory();
      }
    });
  }

  async removeEditorElement(id) {
    runInAction(() => {
      const existingElement = this.editorElements.findIndex(
        el => el.type === 'imageUrl' && el.id === id
      );

      if (
        this.editorElements[existingElement]?.pointId &&
        this.editorElements[existingElement]?.type === 'imageUrl' &&
        this.editorElements[existingElement]?.properties.src !== ''
      ) {

        const elementToUpdate = this.editorElements[existingElement];
        if (elementToUpdate.fabricObject && this.canvas) {
          this.canvas.remove(elementToUpdate.fabricObject);
          elementToUpdate.fabricObject = null;
        }

        this.editorElements = this.editorElements.map((element, index) => {
          if (index === existingElement) {
            return {
              ...element,
              subType: 'placeholder',
              properties: {
                ...element.properties,
                src: '',
                minUrl: '',
              },
              fabricObject: null,
            };
          }
          return element;
        });


        this.refreshElements();
        this.optimizedCleanupEmptyRows();

        return;
      }


      const elementToRemove = this.editorElements.find(
        element => element.id === id
      );
      if (!elementToRemove) {

        const anim = this.animations.find(a => a.id === id);
        if (anim) {
          if (anim.type === 'glTransition') {
            this.removeGLTransition(anim.id);
          } else {
            this.removeAnimation(anim.id);
          }
          return;
        }


        if (typeof id === 'string' && id.startsWith('animation-')) {
          const animId = id.slice('animation-'.length);
          const anim = this.animations.find(a => a.id === animId);
          if (anim) {
            if (anim.type === 'glTransition') {
              this.removeGLTransition(anim.id);
            } else {
              this.removeAnimation(anim.id);
            }
            return;
          }
        }

        return;
      }


      const targetAnimations = this.animations.filter(animation => {
        const targetIds =
          animation.targetIds ||
          (animation.targetId ? [animation.targetId] : []);
        return targetIds.includes(id) && animation.type !== 'glTransition';
      });
      targetAnimations.forEach(animation => {
        this.removeAnimation(animation.id);
      });


      const glTransitions = this.animations.filter(
        animation =>
          animation.type === 'glTransition' &&
          (animation.fromElementId === id || animation.toElementId === id)
      );


      glTransitions.forEach(transition => {

        const glTransitionElement = this.glTransitionElements.get(
          transition.id
        );
        if (
          glTransitionElement &&
          glTransitionElement.fabricObject &&
          this.canvas
        ) {
          this.canvas.remove(glTransitionElement.fabricObject);
        }


        this.removeGLTransition(transition.id);
      });


      if (this.canvas) {
        this.canvas.requestRenderAll();
      }


      {
        let derivedAnimationId = elementToRemove.animationId;
        if (
          !derivedAnimationId &&
          typeof elementToRemove.id === 'string' &&
          elementToRemove.id.startsWith('animation-')
        ) {
          derivedAnimationId = elementToRemove.id.slice('animation-'.length);
        }
        if (
          !derivedAnimationId &&
          elementToRemove.properties?.originalAnimation?.id
        ) {
          derivedAnimationId = elementToRemove.properties.originalAnimation.id;
        }
        if (derivedAnimationId) {
          const animation = this.animations.find(
            a => a.id === derivedAnimationId
          );
          if (animation) {
            if (animation.type === 'glTransition') {
              this.removeGLTransition(animation.id);
            } else {
              this.animations = this.animations.filter(
                a => a.id !== derivedAnimationId
              );
              this.editorElements = this.editorElements.filter(
                el =>
                  !(
                    el.type === 'animation' &&
                    el.animationId === derivedAnimationId
                  ) && el.id !== `animation-${derivedAnimationId}`
              );
            }
          }
        }
      }


      if (elementToRemove.fabricObject && this.canvas) {
        this.canvas.remove(elementToRemove.fabricObject);
        elementToRemove.fabricObject = null;
      }





      if (elementToRemove.type === 'audio') {
        const audioElement = document.getElementById(
          elementToRemove.properties.elementId
        );
        if (audioElement) {
          audioElement.remove();
        }
      }

      this.shiftElementsAfterRemoval(elementToRemove);

      this.editorElements = this.editorElements.filter(
        element => element.id !== id
      );

      this.refreshElements();
      this.optimizedCleanupEmptyRows();


      this.updateCanvasFrameFill();
    });

    await Promise.resolve();

    if (!this.isUndoRedoOperation) {

      if (window.dispatchSaveTimelineState) {
        window.dispatchSaveTimelineState(this);
      }
    }
  }

  addEditorElement(editorElement, isImageUrl = false) {

    if (editorElement.type === 'audio') {

      const existingAudio = document.getElementById(
        editorElement.properties.elementId
      );
      if (existingAudio) {
        existingAudio.remove();
      }


      const audioElement = document.createElement('audio');
      audioElement.id = editorElement.properties.elementId;
      audioElement.src = editorElement.properties.src;


      audioElement.playbackRate = this.playbackRate;
      audioElement.volume = this.volume;


      if (editorElement.properties.audioOffset !== undefined) {
        audioElement.currentTime = editorElement.properties.audioOffset / 1000;
      }

      document.body.appendChild(audioElement);
    }


    this.setEditorElements([editorElement, ...this.editorElements]);

    if (isImageUrl) {
      if (!this.isInitializing) {
      }
      return;
    }

    this.refreshElements();

    if (!this.isInitializing) {
    }
  }


  splitVideoElement = action((element, splitPoint) => {
    if (element.type !== 'video') return;


    const validSplitPoint = Math.max(
      element.timeFrame.start,
      Math.min(element.timeFrame.end, splitPoint)
    );

    if (validSplitPoint <= element.timeFrame.start || validSplitPoint >= element.timeFrame.end) {
      return
    }

    const elementIndex = this.editorElements.findIndex(el => el.id === element.id);
    if (elementIndex === -1) return;


    const firstDuration = validSplitPoint - element.timeFrame.start;
    const secondDuration = element.timeFrame.end - validSplitPoint;


    const originalOffset = element.properties.audioOffset || 0;
    const secondOffset = originalOffset + (validSplitPoint - element.timeFrame.start);


    const firstElement = {
      ...element,
      timeFrame: {
        start: element.timeFrame.start,
        end: validSplitPoint,
      },
      duration: firstDuration,
      properties: {
        ...element.properties,
        duration: firstDuration,
      },
    };


    const secondElementId = getUid();
    const secondElement = {
      ...element,
      id: secondElementId,
      name: `${element.name || 'Video'} (split)`,
      timeFrame: {
        start: validSplitPoint,
        end: element.timeFrame.end,
      },
      duration: secondDuration,
      properties: {
        ...element.properties,
        elementId: `video-${secondElementId}`,
        audioOffset: secondOffset,
        duration: secondDuration,
      },
      fabricObject: null
    };


    this.editorElements[elementIndex] = firstElement;


    this.editorElements.splice(elementIndex + 1, 0, secondElement);






    this.refreshElements();

    if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
      window.dispatchSaveTimelineState(this);
    }
  });


  splitAudioElement = action((element, splitPoint) => {
    if (element.type !== 'audio') return;


    const validSplitPoint = Math.max(
      element.timeFrame.start,
      Math.min(element.timeFrame.end, splitPoint)
    );

    if (validSplitPoint <= element.timeFrame.start || validSplitPoint >= element.timeFrame.end) {
      return
    }

    const elementIndex = this.editorElements.findIndex(el => el.id === element.id);
    if (elementIndex === -1) return;


    const firstDuration = validSplitPoint - element.timeFrame.start;
    const secondDuration = element.timeFrame.end - validSplitPoint;


    const originalOffset = element.properties.audioOffset || 0;
    const secondOffset = originalOffset + (validSplitPoint - element.timeFrame.start);


    const firstElement = {
      ...element,
      timeFrame: {
        start: element.timeFrame.start,
        end: validSplitPoint,
      },
      duration: firstDuration,
      properties: {
        ...element.properties,
        duration: firstDuration,
      },
    };


    const secondElementId = getUid();
    const secondElement = {
      ...element,
      id: secondElementId,
      name: `${element.name || 'Audio'} (split)`,
      timeFrame: {
        start: validSplitPoint,
        end: element.timeFrame.end,
      },
      duration: secondDuration,
      properties: {
        ...element.properties,
        elementId: `audio-${secondElementId}`,
        audioOffset: secondOffset,
        duration: secondDuration,
      },
    };


    this.editorElements[elementIndex] = firstElement;


    this.editorElements.splice(elementIndex + 1, 0, secondElement);


    const secondAudioElement = document.createElement('audio');
    secondAudioElement.id = secondElement.properties.elementId;
    secondAudioElement.src = secondElement.properties.src;
    secondAudioElement.playbackRate = this.playbackRate;
    secondAudioElement.volume = this.volume;
    if (secondOffset !== undefined) {
      secondAudioElement.currentTime = secondOffset / 1000;
    }
    document.body.appendChild(secondAudioElement);


    this.refreshElements();

    if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
      window.dispatchSaveTimelineState(this);
    }
  });


  splitImageElement = action((element, splitPoint) => {
    if (element.type !== 'imageUrl' && element.type !== 'image') return;


    const validSplitPoint = Math.max(
      element.timeFrame.start,
      Math.min(element.timeFrame.end, splitPoint)
    );

    if (
      validSplitPoint <= element.timeFrame.start ||
      validSplitPoint >= element.timeFrame.end
    ) {
      return
    }

    const elementIndex = this.editorElements.findIndex(
      el => el.id === element.id
    );
    if (elementIndex === -1) return;


    const firstDuration = validSplitPoint - element.timeFrame.start;
    const secondDuration = element.timeFrame.end - validSplitPoint;




    const firstElement = {
      ...element,
      timeFrame: {
        start: element.timeFrame.start,
        end: validSplitPoint,
      },
      duration: firstDuration,
      fabricObject: null,
    };

    const secondElementId = getUid();
    const secondElement = {
      ...element,
      id: secondElementId,
      name: `${element.name || 'Image'} (split)`,
      timeFrame: {
        start: validSplitPoint,
        end: element.timeFrame.end,
      },
      duration: secondDuration,
      fabricObject: null,
    };


    const newEditorElements = [...this.editorElements];
    newEditorElements[elementIndex] = firstElement;
    newEditorElements.splice(elementIndex + 1, 0, secondElement);


    this.setEditorElements(newEditorElements);
  });

  removeAllTextElementsWithPointId() {

    const filteredElements = this.editorElements.filter(
      element => !(element.type === 'text' && element.pointId)
    );


    if (filteredElements.length !== this.editorElements.length) {
      this.setEditorElements(filteredElements);
      this.optimizedCleanupEmptyRows();
      this.refreshElements();
    }
  }

  removeAllElementsForScene(sceneId) {


    const filteredElements = this.editorElements.filter(element => {

      if (element.pointId === sceneId) {
        return false
      }


      if (element.pointId && element.pointId.startsWith(`${sceneId}_split_`)) {
        return false
      }

      return true
    });


    if (filteredElements.length !== this.editorElements.length) {
      this.setEditorElements(filteredElements);
      this.optimizedCleanupEmptyRows();
      this.refreshElements();


      if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
        window.dispatchSaveTimelineState(this);
      }
    }
  }

  removeAllSubtitles() {

    const filteredElements = this.editorElements.filter(
      element => !(element.type === 'text' && element.subType === 'subtitles')
    );


    if (filteredElements.length !== this.editorElements.length) {

      const filteredAnimations = this.animations.filter(animation => {

        const targetElement = this.editorElements.find(
          el => el.id === animation.targetId
        );
        return !(
          targetElement?.type === 'text' &&
          targetElement?.subType === 'subtitles'
        );
      });

      this.animations = filteredAnimations;
      this.setEditorElements(filteredElements);
      this.optimizedCleanupEmptyRows();
      this.refreshElements();


      if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
        window.dispatchSaveTimelineState(this);
      }
    }
  }

  setMaxTime(maxTime) {

    const lastElement = this.editorElements
      .slice()
      .sort((a, b) => b.timeFrame.end - a.timeFrame.end)[0];



    const buffer = Math.max(
      30000,
      lastElement ? lastElement.timeFrame.end * 0.2 : 30000
    );

    this.maxTime = Math.max(
      maxTime,
      lastElement ? lastElement.timeFrame.end + buffer : buffer
    );
  }

  playSubtitle(element) {
    const duration = element.timeFrame.end - element.timeFrame.start;
    this.updateTimeTo(element.timeFrame.start);
    this.setPlaying(true);


    setTimeout(() => {
      this.setPlaying(false);
    }, duration);
  }

  setPlaying(playing) {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }


    if (playing && this.currentTimeInMs >= this.lastElementEnd - 100) {
      this.updateTimeTo(0);
      this.playing = true;
      this.startedTime = Date.now();
      this.startedTimePlay = 0;

      if (!this.isRecording) {
        requestAnimationFrame(() => this.playFrames());
      }
      return;
    }

    this.playing = playing;

    if (this.playing) {
      this.startedTime = Date.now();
      this.startedTimePlay = this.currentTimeInMs;

      if (!this.isRecording) {
        requestAnimationFrame(() => this.playFrames());
      }
    } else {

      this.editorElements
        .filter(element => element.type === 'video')
        .forEach(element => {
          const video = document.getElementById(element.properties.elementId);
          if (isHtmlVideoElement(video) && !video.paused) {
            video.pause();

          }
        });


      this.editorElements
        .filter(element => element.type === 'audio')
        .forEach(element => {
          const audio = document.getElementById(element.properties.elementId);
          if (audio) {
            audio.pause();

          }
        });
    }
  }

  playFrames() {
    if (!this.playing) {
      return;
    }
    const elapsedTime = Date.now() - this.startedTime;
    const adjustedElapsedTime = elapsedTime * this.playbackRate;
    const newTime = this.startedTimePlay + adjustedElapsedTime;

    if (newTime >= this.lastElementEnd) {
      this.updateTimeTo(this.lastElementEnd);
      this.setPlaying(false);
      return;
    }

    this.updateTimeTo(newTime);




    const frameInterval = this.playbackRate >= 1.5 ? 32 : 16

    setTimeout(() => {
      requestAnimationFrame(() => this.playFrames());
    }, frameInterval);
  }

  updateTimeTo(newTime) {
    updateTimeToUtil({ newTime, store: this });
  }

  handleSeek(seek) {
    if (this.playing) {
      this.setPlaying(false);
    }

    this.updateTimeTo(seek);
    this.updateVideoElements();
    this.updateAudioElements();
  }

  updateVideoElements() {
    const now = performance.now();
    const videoElements = this.editorElements.filter(
      element => element.type === 'video'
    );


    if (!videoElements.length) return;


    videoElements.forEach(element => {
      if (!element || !element.properties) return;

      const video = document.getElementById(element.properties.elementId);
      if (!isHtmlVideoElement(video)) return;


      if (video.playbackRate !== this.playbackRate) {
        video.playbackRate = this.playbackRate;
      }


      const elementTime = this.currentTimeInMs - element.timeFrame.start;
      const videoTime = Math.max(0, elementTime / 1000);


      const isInTimeframe =
        this.currentTimeInMs >= element.timeFrame.start &&
        this.currentTimeInMs <= element.timeFrame.end;

      if (isInTimeframe) {

        const videoOffset = (element.properties.videoOffset || 0) / 1000;
        const adjustedVideoTime = videoTime + videoOffset;


        const timeDiff = Math.abs(video.currentTime - adjustedVideoTime);
        if (timeDiff > 0.1) {
          video.currentTime = Math.min(adjustedVideoTime, video.duration || 0);
        }


        if (this.playing) {
          if (video.paused) {

            if (video.readyState >= 2) {

              const playPromise = video.play();
              if (playPromise !== undefined) {
                playPromise.catch(error => {
                  console.warn(`Video play failed for ${element.id}:`, error);

                  video.load();
                  video
                    .play()
                    .catch(err =>
                      console.warn(`Retry play failed for ${element.id}:`, err)
                    );
                });
              }
            } else {

              video.addEventListener(
                'canplay',
                () => {
                  if (this.playing) {

                    video
                      .play()
                      .catch(err =>
                        console.warn(
                          `Play after canplay failed for ${element.id}:`,
                          err
                        )
                      );
                  }
                },
                { once: true }
              );
            }
          }
        }
      } else {

        if (!video.paused) {
          video.pause();
        }
      }


      element.properties.lastUpdateTime = now;
    });
  }

  updateAudioElements() {

    const audioElements = this.editorElements.filter(el => el.type === 'audio');




    audioElements.forEach(el => {
      const audioElement = document.getElementById(el.properties.elementId);
      if (!audioElement) return;


      const audioOffset = el.properties.audioOffset || 0;
      const offsetInSeconds = Math.max(0, audioOffset / 1000);


      const elementVolume =
        typeof el.properties.volume === 'number' ? el.properties.volume : 1;
      const finalVolume = Math.max(0, Math.min(1, elementVolume * this.volume));


      if (audioElement.volume !== finalVolume) {
        audioElement.volume = finalVolume;
      }


      if (audioElement.playbackRate !== this.playbackRate) {
        audioElement.playbackRate = this.playbackRate;
      }


      if (this.playing) {

        if (
          this.currentTimeInMs >= el.timeFrame.start &&
          this.currentTimeInMs < el.timeFrame.end
        ) {

          const positionInAudio =
            (this.currentTimeInMs - el.timeFrame.start) / 1000 +
            offsetInSeconds;



          const updateThreshold = this.playbackRate >= 1.5 ? 0.2 : 0.1;


          if (
            Math.abs(audioElement.currentTime - positionInAudio) >
            updateThreshold
          ) {
            try {
              audioElement.currentTime = positionInAudio;
            } catch (error) {
              console.error('Error updating audio position:', error);
            }
          }


          if (audioElement.paused) {
            try {
              const playPromise = audioElement.play();
              if (playPromise !== undefined) {
                playPromise.catch(e => {
                  console.error('Error playing audio:', e);
                });
              }
            } catch (error) {
              console.error('Error playing audio:', error);
            }
          }
        } else {

          if (!audioElement.paused) {
            try {
              audioElement.pause();
            } catch (error) {
              console.error('Error pausing audio:', error);
            }
          }
        }
      } else {

        if (!audioElement.paused) {
          try {
            audioElement.pause();
          } catch (error) {
            console.error('Error pausing audio:', error);
          }
        }
      }
    });
  }

  setVideoFormat(format) {
    this.selectedVideoFormat = format;
  }

  saveCanvasToVideoWithAudio() {
    this.saveCanvasToVideoWithAudioWebmMp4();
  }

  async saveCanvasToVideoWithAudioWebmMp4() {
    const canvas = document.getElementById('canvas');
    let audioContext = null;
    let mediaRecorder = null;


    const reloadAudioElements = async audioElements => {
      return Promise.all(
        audioElements.map(async element => {
          const audio = document.getElementById(element.properties.elementId);
          if (audio) {

            const newAudio = new Audio();
            newAudio.id = element.properties.elementId;
            newAudio.src = element.properties.src;
            newAudio.crossOrigin = 'anonymous';
            newAudio.volume = this.volume;
            newAudio.playbackRate = this.playbackRate;


            audio.parentNode.replaceChild(newAudio, audio);


            await new Promise(resolve => {
              newAudio.addEventListener('loadeddata', resolve, { once: true });
            });

            return newAudio;
          }
          return null;
        })
      );
    };


    const restoreAudioElements = async audioElements => {
      return Promise.all(
        audioElements.map(async element => {
          try {
            const audio = document.getElementById(element.properties.elementId);
            if (audio) {

              const newAudio = new Audio();
              newAudio.id = element.properties.elementId;
              newAudio.src = element.properties.src;
              newAudio.crossOrigin = 'anonymous';
              newAudio.volume = this.volume;
              newAudio.playbackRate = this.playbackRate;


              audio.parentNode.replaceChild(newAudio, audio);


              await new Promise(resolve => {
                newAudio.addEventListener('loadeddata', resolve, {
                  once: true,
                });
              });


              const elementIndex = this.editorElements.findIndex(
                el => el.id === element.id
              );
              if (elementIndex !== -1) {
                runInAction(() => {
                  this.editorElements[elementIndex] = {
                    ...this.editorElements[elementIndex],
                    properties: {
                      ...this.editorElements[elementIndex].properties,
                      elementId: newAudio.id,
                    },
                  };
                });
              }

              return newAudio;
            }
            return null;
          } catch (error) {
            console.error('Error restoring audio element:', error);
            return null;
          }
        })
      );
    };

    try {
      window.dispatchEvent(
        new CustomEvent('renderingStateChange', {
          detail: { state: 'rendering', progress: 0 },
        })
      );

      const lastElement = this.editorElements
        .slice()
        .sort((a, b) => b.timeFrame.end - a.timeFrame.end)[0];
      const lastElementEnd = lastElement ? lastElement.timeFrame.end : 0;

      const durationSeconds = Math.ceil(lastElementEnd / 1000) || 5;
      const durationMs = durationSeconds * 1000;
      const fps = 60;
      const frameInterval = 1000 / fps;


      this.setPlaying(false);
      this.updateTimeTo(0);


      await new Promise(resolve => setTimeout(resolve, 200));


      this.updateTimeTo(0);
      await this.refreshElements()

      if (this.canvas) {
        this.canvas.requestRenderAll();
      }


      await new Promise(resolve => setTimeout(resolve, 50));

      const videoStream = canvas.captureStream(0);
      let finalStream = videoStream;
      const videoTrack = videoStream.getVideoTracks()[0];

      const audioElements = this.editorElements.filter(
        element => element.type === 'audio'
      );

      if (audioElements.length > 0) {
        try {

          await reloadAudioElements(audioElements);


          if (audioContext) {
            await audioContext.close();
          }
          audioContext = new (window.AudioContext ||
            window.webkitAudioContext)();
          const destination = audioContext.createMediaStreamDestination();
          const gainNode = audioContext.createGain();
          gainNode.gain.value = 1.0;


          const audioSources = await Promise.all(
            audioElements.map(async element => {
              const audio = document.getElementById(
                element.properties.elementId
              );
              if (audio) {

                audio.pause();
                audio.currentTime = 0;
                audio.volume = this.volume;
                audio.playbackRate = this.playbackRate;


                await new Promise(resolve => {
                  const handleCanPlay = () => {
                    audio.removeEventListener('canplaythrough', handleCanPlay);
                    resolve();
                  };
                  audio.addEventListener('canplaythrough', handleCanPlay);
                  audio.load();
                });

                const source = audioContext.createMediaElementSource(audio);
                source.connect(gainNode);
                return { source, audio };
              }
              return null;
            })
          ).then(sources => sources.filter(Boolean));

          gainNode.connect(destination);
          gainNode.connect(audioContext.destination);

          const audioTracks = destination.stream.getAudioTracks();
          if (audioTracks.length > 0) {
            finalStream = new MediaStream([videoTrack, audioTracks[0]]);
          }

          this.recordingAudioElements = audioSources.map(({ audio }) => audio);
        } catch (audioError) {
          console.error('Failed to setup audio for recording:', audioError);

          this.recordingAudioElements = [];
        }
      }


      let mimeType;
      let fileExtension;
      let codecOptions;

      if (this.selectedVideoFormat === 'mp4') {
        codecOptions = [
          'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
          'video/mp4;codecs=avc1.4D401E,mp4a.40.2',
          'video/mp4;codecs=avc1.640028,mp4a.40.2',
          'video/mp4',
        ];
        fileExtension = 'mp4';
      } else {
        codecOptions = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm;codecs=vp9,vorbis',
          'video/webm;codecs=vp8,vorbis',
          'video/webm',
        ];
        fileExtension = 'webm';
      }


      mimeType = codecOptions.find(codec =>
        MediaRecorder.isTypeSupported(codec)
      );

      if (!mimeType) {
        throw new Error('No supported video recording codec found');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `video-${timestamp}.${fileExtension}`;

      return new Promise((resolve, reject) => {
        const chunks = [];

        const recorderOptions = {
          mimeType,
          videoBitsPerSecond: 8000000,
          audioBitsPerSecond: 128000,
        };

        mediaRecorder = new MediaRecorder(finalStream, recorderOptions);

        mediaRecorder.ondataavailable = event => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          try {

            if (this.recordingAudioElements) {
              for (const audio of this.recordingAudioElements) {
                audio.pause();
                audio.currentTime = 0;
              }
              this.recordingAudioElements = null;
            }


            if (audioContext) {
              await audioContext.close();
              audioContext = null;
            }

            const blob = new Blob(chunks, { type: mimeType });
            this.downloadBlob(blob, filename);


            await restoreAudioElements(audioElements);


            this.updateTimeTo(0);
            this.refreshElements();

            window.dispatchEvent(
              new CustomEvent('renderingStateChange', {
                detail: { state: 'idle', progress: 100 },
              })
            );

            resolve();
          } catch (error) {
            reject(error);
          }
        };


        setTimeout(async () => {
          try {

            if (this.recordingAudioElements) {
              await Promise.all(
                this.recordingAudioElements.map(async audio => {
                  try {
                    audio.pause();
                    audio.currentTime = 0;

                    if (audio.readyState < 4) {
                      await new Promise(resolve => {
                        const handleCanPlay = () => {
                          audio.removeEventListener(
                            'canplaythrough',
                            handleCanPlay
                          );
                          resolve();
                        };
                        audio.addEventListener('canplaythrough', handleCanPlay);
                      });
                    }
                  } catch (err) {
                    console.error('Audio preparation failed:', err);
                  }
                })
              );
            }


            mediaRecorder.start();


            await new Promise(resolve => setTimeout(resolve, 200));


            if (mediaRecorder.state !== 'recording') {
              console.warn('MediaRecorder not ready, waiting...');
              await new Promise(resolve => setTimeout(resolve, 100));
            }


            this.updateTimeTo(0);
            this.refreshElements();


            await new Promise(resolve => setTimeout(resolve, 50));


            this.isRecording = true;
            this.setPlaying(true);


            if (videoTrack && videoTrack.readyState === 'live') {
              videoTrack.requestFrame();
            }


            window.dispatchEvent(
              new CustomEvent('renderingStateChange', {
                detail: { state: 'rendering', progress: 0 },
              })
            );


            this.startedTime = Date.now();
            this.startedTimePlay = 0;


            let lastFrameCapture = 0;
            let frameNumber = 0;

            const captureFrame = () => {
              if (mediaRecorder.state !== 'recording') return;


              const targetTime = (frameNumber * 1000) / fps;
              const elapsedTime = Date.now() - this.startedTime;
              const adjustedElapsedTime = elapsedTime * this.playbackRate;
              const newTime = this.startedTimePlay + adjustedElapsedTime;


              if (adjustedElapsedTime >= targetTime) {
                videoTrack.requestFrame();
                frameNumber++;
                lastFrameCapture = adjustedElapsedTime;
              }


              if (newTime < this.maxTime) {
                this.updateTimeTo(newTime);


                const progress = Math.min(
                  Math.round((newTime / lastElementEnd) * 100),
                  99
                );


                if (frameNumber % 10 === 0) {
                  window.dispatchEvent(
                    new CustomEvent('renderingStateChange', {
                      detail: { state: 'rendering', progress },
                    })
                  );
                }


                requestAnimationFrame(captureFrame);
              }
            };


            requestAnimationFrame(captureFrame);


            if (this.recordingAudioElements) {
              const audioPromises = this.recordingAudioElements.map(
                async audio => {
                  try {
                    return await audio.play();
                  } catch (err) {
                    console.error('Audio play failed:', err);

                    try {
                      audio.load();
                      await new Promise(resolve => setTimeout(resolve, 50));
                      return await audio.play();
                    } catch (retryErr) {
                      console.error('Audio recovery failed:', retryErr);
                    }
                  }
                }
              );


              Promise.all(audioPromises).catch(error => {
                console.error('Some audio elements failed to start:', error);
              });
            }


            setTimeout(() => {
              this.setPlaying(false);
              this.isRecording = false;
              if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
              }
            }, durationMs);
          } catch (error) {
            reject(error);
          }
        }, 20)
      });
    } catch (error) {
      console.error('Error in canvas recording:', error);
      alert(`Error creating video: ${error.message}`);


      this.isRecording = false;
      if (this.recordingAudioElements) {
        this.recordingAudioElements.forEach(audio => {
          audio.pause();
          audio.currentTime = 0;
        });
        this.recordingAudioElements = null;
      }

      if (audioContext) {
        await audioContext.close();
      }

      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }


      await restoreAudioElements(audioElements);
      this.updateTimeTo(0);
      this.refreshElements();

      window.dispatchEvent(
        new CustomEvent('renderingStateChange', {
          detail: { state: 'idle', progress: 0 },
        })
      );
    }
  }

  async saveWithMediaRecorder(canvas) {
    try {
      window.dispatchEvent(
        new CustomEvent('renderingStateChange', {
          detail: { state: 'rendering', progress: 0 },
        })
      );

      const durationSeconds = Math.ceil(this.maxTime / 1000) || 5;
      const fps = 30;

      this.setPlaying(false);
      this.updateTimeTo(0);

      await new Promise(resolve => setTimeout(resolve, 100));

      let stream = canvas.captureStream(fps);


      const audioElements = this.editorElements.filter(
        element => element.type === 'audio'
      );


      if (audioElements.length > 0) {
        try {
          const audioContext = new AudioContext();
          const destination = audioContext.createMediaStreamDestination();


          for (const element of audioElements) {
            const audio = document.getElementById(element.properties.elementId);
            if (audio) {
              const source = audioContext.createMediaElementSource(audio);
              source.connect(destination);
            }
          }


          const tracks = [
            ...stream.getVideoTracks(),
            ...destination.stream.getAudioTracks(),
          ];
          stream = new MediaStream(tracks);
        } catch (audioError) {
          console.warn('Could not add audio to recording:', audioError);

        }
      }


      const options = {
        mimeType:
          this.selectedVideoFormat === 'mp4'
            ? 'video/webm; codecs=h264'
            : 'video/webm; codecs=vp9',
        videoBitsPerSecond: 5000000
      };


      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm; codecs=vp8';

        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = 'video/webm';

          if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            throw new Error('No supported media recording mime type found');
          }
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      const chunks = [];

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: options.mimeType });
        this.downloadBlob(blob, filename);

        window.dispatchEvent(
          new CustomEvent('renderingStateChange', {
            detail: { state: 'idle', progress: 100 },
          })
        );
      };

      const updateProgress = () => {
        if (mediaRecorder.state !== 'recording') return;

        const progress = Math.min(
          Math.round((this.currentTimeInMs / this.maxTime) * 100),
          99
        );

        window.dispatchEvent(
          new CustomEvent('renderingStateChange', {
            detail: { state: 'rendering', progress },
          })
        );

        if (this.currentTimeInMs < this.maxTime) {
          requestAnimationFrame(updateProgress);
        }
      };

      this.setPlaying(true);
      mediaRecorder.start();
      requestAnimationFrame(updateProgress);

      setTimeout(() => {
        mediaRecorder.stop();
        this.setPlaying(false);
      }, durationSeconds * 1000);
    } catch (error) {
      console.error('Error in MediaRecorder method:', error);
      alert(`Error creating video: ${error.message}`);

      window.dispatchEvent(
        new CustomEvent('renderingStateChange', {
          detail: { state: 'idle', progress: 0 },
        })
      );
    }
  }


  muxChunksToMp4(
    chunks,
    {
      width,
      height,
      fps,
      frameDuration,
      codec = 'avc1.640032',
      bitrate = 13000000,
    }
  ) {
    try {
      const mp4boxFile = MP4Box.createFile();
      const timescale = 1000000
      const samples = [];


      for (const chunk of chunks) {

        const arrayBuffer = new ArrayBuffer(chunk.byteLength);

        const uint8Array = new Uint8Array(arrayBuffer);

        chunk.copyTo(uint8Array);

        samples.push({
          dts: chunk.timestamp,
          cts: chunk.timestamp,
          duration: frameDuration,
          size: arrayBuffer.byteLength,
          is_sync: chunk.type === 'key',
          data: uint8Array
        });
      }


      const track = {
        id: 1,
        created: new Date(),
        modified: new Date(),
        movie_timescale: timescale,
        track_duration:
          samples.length > 0
            ? samples[samples.length - 1].dts + frameDuration
            : 0,
        layer: 0,
        alternate_group: 0,
        volume: 1,
        width: width,
        height: height,
        hdlr: 'vide',
        codec: codec,
        samples: samples,
        bitrate: bitrate
      };


      mp4boxFile.addTrack(track);


      let fileStart = 0;
      for (const sample of samples) {
        const buffer = sample.data

        buffer.fileStart = fileStart;
        buffer.getPosition = function () {
          return this.fileStart;
        };
        fileStart += buffer.byteLength;


        mp4boxFile.appendBuffer(buffer.buffer);
      }


      mp4boxFile.moov.mvhd.rate = 1
      mp4boxFile.moov.mvhd.volume = 1


      mp4boxFile.flush();


      const mp4Buffer = mp4boxFile.write();
      return new Blob([mp4Buffer], { type: 'video/mp4' });
    } catch (error) {
      console.error('Error in muxChunksToMp4:', error);
      throw new Error(`MP4 muxing failed: ${error.message}`);
    }
  }


  async muxWebMWithAudio(videoChunks, audioElements, { fps, filename }) {

    const stream = this.canvas.captureStream(fps);


    if (audioElements.length > 0) {
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();


      for (const element of audioElements) {
        const audio = document.getElementById(element.properties.elementId);
        if (audio) {
          const source = audioContext.createMediaElementSource(audio);
          source.connect(destination);
        }
      }


      const tracks = [
        ...stream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ];
      const combinedStream = new MediaStream(tracks);


      const recorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp8,opus',
        videoBitsPerSecond: 5000000,
      });

      const chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        this.downloadBlob(blob, filename);
      };

      recorder.start();
      setTimeout(() => recorder.stop(), this.maxTime || 5000);
    }
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }


  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  refreshElements() {
    refreshElementsUtil(this);
  }

  updateTextStyle(property, value) {
    if (!this.selectedElement) return;

    const element = this.selectedElement;

    switch (property) {
      case 'color':
        element.properties.color = value;
        break;
      case 'backgroundColor':
        element.properties.backgroundColor = value;
        break;
      case 'backgroundOpacity':
        element.properties.backgroundOpacity = value;
        break;
      case 'backgroundRadius':
        element.properties.backgroundRadius = value;
        break;
      case 'stroke':
        element.properties.stroke = value;
        break;
      case 'strokeColor':
        element.properties.strokeColor = value;
        break;
      case 'strokeOpacity':
        element.properties.strokeOpacity = value;
        break;
      case 'font':
        element.properties.font = value;
        break;
      case 'fontSize':
        element.properties.fontSize = value;
        break;
      case 'fontWeight':
        element.properties.fontWeight = value;
        break;
      case 'fontStyle':
        element.properties.fontStyle = value;
        break;
      case 'textAlign':
        element.properties.textAlign = value;
        break;
      case 'verticalAlign':
        element.properties.verticalAlign = value;
        break;
      case 'shadowColor':
        element.properties.shadowColor = value;
        break;
      case 'shadowOpacity':
        element.properties.shadowOpacity = value;
        break;
      case 'shadowBlur':
        element.properties.shadowBlur = value;
        break;
      case 'shadowOffsetX':
        element.properties.shadowOffsetX = value;
        break;
      case 'shadowOffsetY':
        element.properties.shadowOffsetY = value;
        break;
      case 'highlightColor':
        element.properties.highlightColor = value;
        break;
    }

    this.updateSelectedElement();
  }

  setApplyToAll(value) {
    this.applyToAll = value;
  }

  setSynchronise(value) {
    this.synchronise = value;
  }

  updateSynchronize(value) {
    if (this.selectedElement && this.selectedElement.type === 'text') {
      const updatedElement = {
        ...this.selectedElement,
        properties: {
          ...this.selectedElement.properties,
          synchronize: value,
        },
      };
      this.updateEditorElement(updatedElement);
    }
  }

  trimAudioElement(editorElement, timeFrame) {

    if (!this.moveState.isMoving) {
      this.moveState.isMoving = true;
      this.moveState.accumulatedMoves = new Map();
    }

    const MIN_DURATION = 1
    let audioOffset = editorElement.properties.audioOffset || 0;
    const originalStart = editorElement.timeFrame.start;


    if (timeFrame.start !== undefined) {
      const shift = timeFrame.start - editorElement.timeFrame.start;
      audioOffset += shift;
    }


    const validatedTimeFrame = {
      start: Math.max(0, timeFrame.start ?? editorElement.timeFrame.start),
      end: Math.min(this.maxTime, timeFrame.end ?? editorElement.timeFrame.end),
    };


    if (validatedTimeFrame.end - validatedTimeFrame.start < MIN_DURATION) {
      if (timeFrame.start !== undefined) {
        validatedTimeFrame.end = validatedTimeFrame.start + MIN_DURATION;
      } else {
        validatedTimeFrame.start = validatedTimeFrame.end - MIN_DURATION;
      }
    }


    const originalAudioElement = this.getAudioResourceById(editorElement.id);
    if (originalAudioElement && originalAudioElement.duration) {
      const currentDuration = validatedTimeFrame.end - validatedTimeFrame.start;
      if (currentDuration > originalAudioElement.duration) {

        if (timeFrame.start !== undefined) {
          validatedTimeFrame.end =
            validatedTimeFrame.start + originalAudioElement.duration;
        } else {
          validatedTimeFrame.start =
            validatedTimeFrame.end - originalAudioElement.duration;
        }
      }
    }


    const subtitleElements = this.editorElements.filter(
      el =>
        el.type === 'text' &&
        el.subType === 'subtitles' &&
        el.properties.audioId === editorElement.id
    );

    subtitleElements.forEach(subtitleElement => {

      const newTimeFrame = {
        start: Math.max(
          subtitleElement.timeFrame.start,
          validatedTimeFrame.start
        ),
        end: Math.min(subtitleElement.timeFrame.end, validatedTimeFrame.end),
      };


      this.handleSubtitleTrimming(subtitleElement, newTimeFrame);
    });


    this.moveState.accumulatedMoves.set(editorElement.id, {
      element: {
        ...editorElement,
        timeFrame: validatedTimeFrame,
        properties: {
          ...editorElement.properties,
          audioOffset: Math.max(0, audioOffset)
        },
      },
      timeFrame: validatedTimeFrame,
      isAudio: true,
    });


    const overlappingElements = this.editorElements.filter(
      el =>
        el.id !== editorElement.id &&
        el.row === editorElement.row &&
        validatedTimeFrame.start < el.timeFrame.end &&
        validatedTimeFrame.end > el.timeFrame.start
    );

    overlappingElements.forEach(el => {
      const updatedTimeFrame = { ...el.timeFrame };

      if (timeFrame.start !== undefined) {
        updatedTimeFrame.end = Math.min(
          validatedTimeFrame.start,
          el.timeFrame.end
        );
      } else if (timeFrame.end !== undefined) {
        updatedTimeFrame.start = Math.max(
          validatedTimeFrame.end,
          el.timeFrame.start
        );
      }


      if (updatedTimeFrame.end - updatedTimeFrame.start < MIN_DURATION) {
        if (timeFrame.start !== undefined) {
          updatedTimeFrame.start = updatedTimeFrame.end - MIN_DURATION;
        } else {
          updatedTimeFrame.end = updatedTimeFrame.start + MIN_DURATION;
        }
      }

      this.moveState.accumulatedMoves.set(el.id, {
        element: {
          ...el,
          timeFrame: updatedTimeFrame,
        },
        timeFrame: updatedTimeFrame,
        isAudio: isEditorAudioElement(el),
      });
    });


    if (!this.moveState.rafId) {
      this.moveState.rafId = requestAnimationFrame(() =>
        this.processAudioMoveUpdate()
      );
    }
  }

  trimVideoElement(editorElement, timeFrame) {

    if (!this.moveState.isMoving) {
      this.moveState.isMoving = true;
      this.moveState.accumulatedMoves = new Map();
    }

    const MIN_DURATION = 1
    let videoOffset = editorElement.properties.videoOffset || 0;
    const originalStart = editorElement.timeFrame.start;


    if (timeFrame.start !== undefined) {
      const shift = timeFrame.start - editorElement.timeFrame.start;
      videoOffset += shift;
    }


    const validatedTimeFrame = {
      start: Math.max(0, timeFrame.start ?? editorElement.timeFrame.start),
      end: Math.min(this.maxTime, timeFrame.end ?? editorElement.timeFrame.end),
    };


    if (validatedTimeFrame.end - validatedTimeFrame.start < MIN_DURATION) {
      if (timeFrame.start !== undefined) {
        validatedTimeFrame.end = validatedTimeFrame.start + MIN_DURATION;
      } else {
        validatedTimeFrame.start = validatedTimeFrame.end - MIN_DURATION;
      }
    }


    const originalVideoElement = this.videos.find(
      v => v.id === editorElement.id
    );
    if (originalVideoElement && originalVideoElement.duration) {
      const currentDuration = validatedTimeFrame.end - validatedTimeFrame.start;
      if (currentDuration > originalVideoElement.duration) {

        if (timeFrame.start !== undefined) {
          validatedTimeFrame.end =
            validatedTimeFrame.start + originalVideoElement.duration;
        } else {
          validatedTimeFrame.start =
            validatedTimeFrame.end - originalVideoElement.duration;
        }
      }
    }


    this.moveState.accumulatedMoves.set(editorElement.id, {
      element: {
        ...editorElement,
        timeFrame: validatedTimeFrame,
        properties: {
          ...editorElement.properties,
          videoOffset: Math.max(0, videoOffset)
        },
      },
      timeFrame: validatedTimeFrame,
      isVideo: true,
    });


    const overlappingElements = this.editorElements.filter(
      el =>
        el.id !== editorElement.id &&
        el.row === editorElement.row &&
        validatedTimeFrame.start < el.timeFrame.end &&
        validatedTimeFrame.end > el.timeFrame.start
    );

    overlappingElements.forEach(el => {
      const updatedTimeFrame = { ...el.timeFrame };

      if (timeFrame.start !== undefined) {
        updatedTimeFrame.end = Math.min(
          validatedTimeFrame.start,
          el.timeFrame.end
        );
      } else if (timeFrame.end !== undefined) {
        updatedTimeFrame.start = Math.max(
          validatedTimeFrame.end,
          el.timeFrame.start
        );
      }


      if (updatedTimeFrame.end - updatedTimeFrame.start < MIN_DURATION) {
        if (timeFrame.start !== undefined) {
          updatedTimeFrame.start = updatedTimeFrame.end - MIN_DURATION;
        } else {
          updatedTimeFrame.end = updatedTimeFrame.start + MIN_DURATION;
        }
      }

      this.moveState.accumulatedMoves.set(el.id, {
        element: {
          ...el,
          timeFrame: updatedTimeFrame,
        },
        timeFrame: updatedTimeFrame,
        isVideo: isEditorVideoElement(el),
      });
    });


    if (!this.moveState.rafId) {
      this.moveState.rafId = requestAnimationFrame(() =>
        this.processVideoMoveUpdate()
      );
    }
  }

  processVideoMoveUpdate() {
    const now = performance.now();
    const timeSinceLastUpdate = now - this.moveState.lastUpdateTime;

    if (timeSinceLastUpdate < this.moveState.updateInterval) {
      this.moveState.rafId = requestAnimationFrame(() =>
        this.processVideoMoveUpdate()
      );
      return;
    }

    if (this.moveState.accumulatedMoves.size > 0) {
      const updates = new Map(this.moveState.accumulatedMoves);

      runInAction(() => {
        this.editorElements = this.editorElements.map(el => {
          const update = updates.get(el.id);
          if (!update) return el;


          return update.element;
        });
      });


      requestAnimationFrame(() => {
        this.updateVideoElements();
        this.canvas?.requestRenderAll();
      });
    }


    this.moveState.accumulatedMoves.clear();
    this.moveState.lastUpdateTime = now;
    this.moveState.rafId = null;


    if (this.moveState.isMoving) {
      this.moveState.rafId = requestAnimationFrame(() =>
        this.processVideoMoveUpdate()
      );
    }
  }

  processAudioMoveUpdate() {
    const now = performance.now();
    const timeSinceLastUpdate = now - this.moveState.lastUpdateTime;

    if (timeSinceLastUpdate < this.moveState.updateInterval) {
      this.moveState.rafId = requestAnimationFrame(() =>
        this.processAudioMoveUpdate()
      );
      return;
    }

    if (this.moveState.accumulatedMoves.size > 0) {
      const updates = new Map(this.moveState.accumulatedMoves);

      runInAction(() => {
        this.editorElements = this.editorElements.map(el => {
          const update = updates.get(el.id);
          if (!update) return el;


          return update.element;
        });
      });


      requestAnimationFrame(() => {
        this.updateAudioElements();
        this.canvas?.requestRenderAll();
      });
    }


    this.moveState.accumulatedMoves.clear();
    this.moveState.lastUpdateTime = now;
    this.moveState.rafId = null;


    if (this.moveState.isMoving) {
      this.moveState.rafId = requestAnimationFrame(() =>
        this.processAudioMoveUpdate()
      );
    }
  }

  debouncedRefreshElements = () => {
    if (this.refreshDebounceTimeout) {
      clearTimeout(this.refreshDebounceTimeout);
    }

    this.refreshDebounceTimeout = setTimeout(() => {
      if (this.pendingUpdates.size > 0) {
        this.refreshElements();
        this.pendingUpdates.clear();
      }
    }, 16)
  };

  shouldUpdatePosition(newPosition) {
    const now = Date.now();


    if (!this.lastPosition) {
      this.lastPosition = newPosition;
      this.lastUpdateTime = now;
      return true;
    }


    if (now - this.lastUpdateTime < this.updateInterval) {
      return false;
    }


    const hasSignificantChange =
      Math.abs(newPosition - this.lastPosition) > this.updateThreshold;

    if (hasSignificantChange) {
      this.lastPosition = newPosition;
      this.lastUpdateTime = now;
      return true;
    }

    return false;
  }


  handleObjectModified(fabricObject, element) {

    if (!this.isUndoRedoOperation) {
    }

    const placement = element.placement;

    let newPlacement;
    if (element.type === 'video' || isEditorImageElement(element)) {
      newPlacement = {
        ...placement,
        x: fabricObject.left ?? placement.x,
        y: fabricObject.top ?? placement.y,

        width: fabricObject.width ?? placement.width,
        height: fabricObject.height ?? placement.height,
        rotation: fabricObject.angle ?? placement.rotation,
        scaleX: fabricObject.scaleX ?? placement.scaleX,
        scaleY: fabricObject.scaleY ?? placement.scaleY,

        cropX:
          fabricObject.cropX !== undefined
            ? fabricObject.cropX
            : placement.cropX,
        cropY:
          fabricObject.cropY !== undefined
            ? fabricObject.cropY
            : placement.cropY,
      };
    } else {
      newPlacement = {
        ...placement,
        x: fabricObject.left ?? placement.x,
        y: fabricObject.top ?? placement.y,

        width: fabricObject.width * (fabricObject.scaleX || 1),
        height: fabricObject.height * (fabricObject.scaleY || 1),
        rotation: fabricObject.angle ?? placement.rotation,
        scaleX: 1,
        scaleY: 1,

        cropX:
          fabricObject.cropX !== undefined
            ? fabricObject.cropX
            : placement.cropX,
        cropY:
          fabricObject.cropY !== undefined
            ? fabricObject.cropY
            : placement.cropY,
      };
    }


    const hasActiveAnimations = this.animations.some(animation => {
      if (
        animation.targetId !== element.id &&
        !(animation.targetIds && animation.targetIds.includes(element.id))
      )
        return false;

      const currentTime = this.currentTimeInMs;
      const animationStart = animation.properties?.startTime || 0;
      const animationEnd =
        animation.properties?.endTime || animation.duration || 1000;
      const elementStart = element.timeFrame?.start || 0;
      const elementEnd = element.timeFrame?.end || 0;

      const absoluteStart = elementStart + animationStart;
      const absoluteEnd = elementStart + animationEnd;

      return currentTime >= absoluteStart && currentTime <= absoluteEnd;
    });


    const updates = new Map();


    let preservedInitialState;
    if (hasActiveAnimations && element.initialState) {


      preservedInitialState = element.initialState;
    } else if (element.initialState) {


      preservedInitialState = {
        scaleX: fabricObject.scaleX,
        scaleY: fabricObject.scaleY,
        left: fabricObject.left,
        top: fabricObject.top,
        opacity: fabricObject.opacity,
      };
    } else {

      preservedInitialState = {
        scaleX: placement.scaleX || fabricObject.scaleX,
        scaleY: placement.scaleY || fabricObject.scaleY,
        left: placement.x || fabricObject.left,
        top: placement.y || fabricObject.top,
        opacity: fabricObject.opacity || 1.0,
      };
    }


    const updatedElement = {
      ...element,
      ...fabricObject,
      placement: newPlacement,
      initialState: preservedInitialState,
    };


    if (element.type === 'text' && fabricObject.type === 'textbox') {
      const newText = fabricObject.text;
      const words = element.properties.words || [];


      if (element.subType === 'subtitles' && words.length > 0) {
        const segmentDuration = element.timeFrame.end - element.timeFrame.start;
        const oldText = element.properties.text;
        const oldWords = oldText.trim().split(/\s+/);
        const newWords = newText.trim().split(/\s+/);

        const wordTimings = [];
        oldWords.forEach((oldWord, index) => {
          const timing = words[index];
          if (timing) {
            wordTimings.push({
              word: oldWord,
              start: timing.start,
              originalStart: timing.start,
              end: timing.end,
            });
          }
        });

        const updatedWords = newWords.map((word, index) => {
          const existingTiming = wordTimings.find(t => t.word === word);
          if (existingTiming) {
            return {
              word,
              start: existingTiming.originalStart,
              end: element.timeFrame.end,
            };
          }


          const totalChars = newWords.reduce((sum, w) => sum + w.length, 0);
          const charsBeforeWord = newWords
            .slice(0, index)
            .reduce((sum, w) => sum + w.length, 0);
          const wordLength = word.length;


          const wordDurationShare = wordLength / totalChars;
          const wordDuration = segmentDuration * wordDurationShare;


          const proportionalStart =
            (charsBeforeWord / totalChars) * segmentDuration;
          const wordStart = element.timeFrame.start + proportionalStart;

          return {
            word,
            start: Math.round(wordStart),
            end: element.timeFrame.end,
          };
        });

        updatedElement.properties = {
          ...updatedElement.properties,
          text: newText,
          words: updatedWords,
          wordObjects: [],
          fontSize: fabricObject.fontSize,
          fontFamily: fabricObject.fontFamily,
          fontWeight: fabricObject.fontWeight,
          fontStyle: fabricObject.fontStyle || 'normal',
          textAlign: fabricObject.textAlign,
          width: fabricObject.width,
          height: fabricObject.height,
        };


        if (updatedWords.length > 0) {
          this.animations = this.animations.filter(
            a => a.targetId !== element.id
          );
          this.animations.push({
            id: `${element.id}-word-animation`,
            targetId: element.id,
            type: 'textWordAnimation',
            duration: 500,
            properties: {},
          });
        }
      } else {

        updatedElement.properties = {
          ...updatedElement.properties,
          text: newText,
          fontSize: fabricObject.fontSize,
          fontFamily: fabricObject.fontFamily,
          fontWeight: fabricObject.fontWeight,
          fontStyle: fabricObject.fontStyle || 'normal',
          textAlign: fabricObject.textAlign,
          width: fabricObject.width,
          height: fabricObject.height,
        };
      }
    }

    updates.set(element.id, updatedElement);


    if (element.type === 'text') {
      this.editorElements.forEach(otherElement => {
        if (
          otherElement.id !== element.id &&
          otherElement.type === 'text' &&
          otherElement.row === element.row
        ) {
          const otherPlacement = {
            ...otherElement.placement,
            x: fabricObject.left ?? otherElement.placement.x,
            y: fabricObject.top ?? otherElement.placement.y,
            width: fabricObject.width * (fabricObject.scaleX || 1),
            height: fabricObject.height * (fabricObject.scaleY || 1),
            rotation: fabricObject.angle ?? otherElement.placement.rotation,
            scaleX: fabricObject.scaleX ?? otherElement.placement.scaleX,
            scaleY: fabricObject.scaleY ?? otherElement.placement.scaleY,
          };

          if (otherElement.fabricObject) {
            otherElement.fabricObject.set({
              left: otherPlacement.x,
              top: otherPlacement.y,
              angle: otherPlacement.rotation,
              scaleX: otherPlacement.scaleX,
              scaleY: otherPlacement.scaleY,
              width: fabricObject.width,
              height: fabricObject.height,
            });
            otherElement.fabricObject.setCoords();
          }

          updates.set(otherElement.id, {
            ...otherElement,
            placement: otherPlacement,
            initialState: {
              scaleX: fabricObject.scaleX,
              scaleY: fabricObject.scaleY,
              left: fabricObject.left,
              top: fabricObject.top,
              opacity: fabricObject.opacity,
            },
          });
        }
      });
    }


    this.isUndoRedoOperation = true;

    try {

      this.editorElements = this.editorElements.map(
        el => updates.get(el.id) || el
      );



      this.canvas.requestRenderAll();
    } finally {
      this.isUndoRedoOperation = false;
    }
  }

  updateSubtitlesStyle(property, value) {

    if (!this.isUndoRedoOperation) {
    }


    const needsZIndexUpdate =
      property.startsWith('shadow') &&
      (property === 'shadowBlur' ||
        property === 'shadowOffsetX' ||
        property === 'shadowOffsetY');
    const needsBackgroundUpdate = property.startsWith('background');
    const needsCanvasRender =
      property.startsWith('shadow') || property.startsWith('background');

    this.editorElements = this.editorElements.map(element => {
      if (element.type === 'text' && element.subType === 'subtitles') {
        const newElement = { ...element };


        if (property.startsWith('shadow')) {
          switch (property) {
            case 'shadowColor':
              newElement.properties.shadow = {
                color: '#000000',
                blur: 0,
                offsetX: 0,
                offsetY: 0,
                opacity: 1,
                ...newElement.properties.shadow,
              };
              newElement.properties.shadow.color = value;
              break;
            case 'shadowBlur':
              newElement.properties.shadow = {
                color: '#000000',
                offsetX: 0,
                offsetY: 0,
                opacity: 1,
                ...newElement.properties.shadow,
                blur: parseInt(value),
              };
              break;
            case 'shadowOffsetX':
              newElement.properties.shadow = {
                color: '#000000',
                blur: 0,
                offsetY: 0,
                opacity: 1,
                ...newElement.properties.shadow,
                offsetX: parseInt(value),
              };
              break;
            case 'shadowOffsetY':
              newElement.properties.shadow = {
                color: '#000000',
                blur: 0,
                offsetX: 0,
                opacity: 1,
                ...newElement.properties.shadow,
                offsetY: parseInt(value),
              };
              break;
            case 'shadowOpacity':
              newElement.properties.shadow = {
                color: '#000000',
                blur: 0,
                offsetX: 0,
                offsetY: 0,
                ...newElement.properties.shadow,
                opacity: parseFloat(value),
              };
              break;
            case 'motionColor':
              newElement.properties.motionColor = value;
              break;
            case 'highlightColor':
              newElement.properties.highlightColor = value;
              break;
          }
        } else {

          let parsedValue = value;
          if (property === 'backgroundRadius') {
            parsedValue = parseInt(value) || 0;
          } else if (property === 'backgroundOpacity') {
            parsedValue = parseFloat(value);
          } else if (property === 'charSpacing') {
            parsedValue = parseFloat(value) || 0;
          } else if (property === 'lineHeight') {
            parsedValue = parseFloat(value) || 1.2;
          }

          newElement.properties = {
            ...newElement.properties,
            [property]: parsedValue,
          };
        }

        return newElement;
      }
      return element;
    });


    requestAnimationFrame(() => {

      this.refreshElements();


      if (needsBackgroundUpdate) {
        this.editorElements.forEach(element => {
          if (element.subType === 'subtitles' && element.fabricObject) {
            this.createSubtitleBackground(element, element.fabricObject);


            if (
              element.properties.wordObjects &&
              element.properties.wordObjects.length > 0
            ) {
              element.properties.wordObjects.forEach(wordObj => {
                if (wordObj && this.canvas.contains(wordObj)) {
                  this.canvas.bringToFront(wordObj);
                }
              });
            }
          }
        });
      }


      if (needsZIndexUpdate) {
        this.editorElements.forEach(element => {
          if (
            element.type === 'text' &&
            element.subType === 'subtitles' &&
            element.properties.wordObjects
          ) {
            this.updateWordZIndex(element);
          }
        });
      }


      if (needsCanvasRender) {
        this.canvas.requestRenderAll();
      }
    });
  }

  initializeWordAnimations(element) {
    const fabricObject = element.fabricObject;
    const words = element.properties.words;
    const textObjects = [];


    const originalWidth = fabricObject.width;
    const originalLeft = fabricObject.left;
    const originalTop = fabricObject.top;


    const baseSpaceWidth = fabricObject.fontSize / 3;
    const spaceWidth =
      baseSpaceWidth + this.subtitlesPanelState.wordSpacingFactor;


    const { lines, lineHeights } = this.calculateWordLines(
      words,
      fabricObject,
      originalWidth,
      spaceWidth
    );


    const totalLinesHeight = lineHeights.reduce(
      (sum, height) => sum + height,
      0
    );
    const originalTotalHeight = lineHeights.length * fabricObject.fontSize;
    const totalExtraSpace = totalLinesHeight - originalTotalHeight;
    const startingTopAdjustment = -totalExtraSpace / 2


    let currentTop = originalTop + startingTopAdjustment;
    lines.forEach((line, lineIndex) => {
      const lineLeft = this.calculateLineStartPosition(
        line,
        originalLeft,
        originalWidth,
        fabricObject.textAlign,
        spaceWidth
      );


      const lineHeight = lineHeights[lineIndex] || fabricObject.fontSize;
      const extraSpace = lineHeight - fabricObject.fontSize;
      const verticalOffset = extraSpace / 2
      const adjustedTop = currentTop + verticalOffset;

      let currentLeft = lineLeft;
      line.forEach((wordData, wordIndex) => {
        const wordObject = this.createWordObject(
          wordData.word,
          currentLeft,
          adjustedTop,
          fabricObject,
        );



        currentLeft +=
          wordData.width + (wordIndex < line.length - 1 ? spaceWidth : 0);
        textObjects.push(wordObject);
        this.canvas.add(wordObject);
        wordObject.bringToFront();
      });

      currentTop += lineHeight
    });


    element.properties.wordObjects = textObjects;


    fabricObject.set('opacity', 0);


    if (element.subType === 'subtitles') {
      this.createSubtitleBackground(element, fabricObject);
    }


    const existingAnimation = this.animations.find(
      a => a.targetId === element.id && a.type === 'textWordAnimation'
    );

    if (!existingAnimation) {
      const wordAnimation = {
        id: `${element.id}-word-animation`,
        targetId: element.id,
        type: 'textWordAnimation',
        effect: 'in',
        duration: 500,
        properties: {},
      };
      this.animations.push(wordAnimation);
    }


    if (element.properties.wordObjects?.length > 0) {
      element.properties.wordObjects.forEach(obj => {
        if (obj && this.canvas.contains(obj)) {
          this.canvas.remove(obj);
        }
      });
      element.properties.wordObjects = [];
    }
  }

  calculateWordLines(words, textObject, maxWidth, spaceWidth) {
    const lines = [[]];
    const lineHeights = [0];
    let currentLine = 0;
    let lineWidths = [0];

    words.forEach(word => {
      let wordWidth;
      let wordHeight;
      const letterSpacing = this.subtitlesPanelState.letterSpacingFactor || 0;

      if (letterSpacing === 0) {

        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        ctx.font = `${textObject.fontWeight} ${textObject.fontSize}px ${textObject.fontFamily}`;
        wordWidth = ctx.measureText(word.word || word.text || '').width;
        wordHeight = textObject.fontSize;
      } else {

        const tempText = new fabric.Text(word.word || word.text || '', {
          fontSize: textObject.fontSize,
          fontWeight: textObject.fontWeight,
          fontFamily: textObject.fontFamily,
          charSpacing: letterSpacing,
        });
        wordWidth = tempText.width;
        wordHeight = tempText.height;
      }




      const lineHeightFactor = this.subtitlesPanelState.lineHeightFactor || 1.2;
      const customLineHeight = lineHeightFactor * textObject.fontSize;

      lineHeights[currentLine] = Math.max(
        lineHeights[currentLine],
        customLineHeight
      );

      if (
        lineWidths[currentLine] +
          wordWidth +
          (lines[currentLine].length > 0 ? spaceWidth : 0) >
        maxWidth
      ) {
        currentLine++;
        lines[currentLine] = [];
        lineWidths[currentLine] = 0;
        lineHeights[currentLine] = customLineHeight;
      }

      lines[currentLine].push({
        word: word,
        width: wordWidth,
      });
      lineWidths[currentLine] +=
        wordWidth + (lines[currentLine].length > 1 ? spaceWidth : 0);
    });

    return { lines, lineHeights };
  }

  calculateLineStartPosition(
    line,
    originalLeft,
    originalWidth,
    textAlign,
    spaceWidth
  ) {
    const lineWidth = line.reduce((width, wordData, index) => {
      return (
        width + wordData.width + (index < line.length - 1 ? spaceWidth : 0)
      );
    }, 0);



    const containerLeft = originalLeft - originalWidth / 2;
    const containerRight = originalLeft + originalWidth / 2;

    switch (textAlign) {
      case 'center':
        return originalLeft - lineWidth / 2;
      case 'left':
        return containerRight - lineWidth;
      default:
        return containerLeft;
    }
  }

  animateBackgroundColor(wordObj, fromColor, toColor, duration) {

    if (wordObj._backgroundAnimationId) {
      cancelAnimationFrame(wordObj._backgroundAnimationId);
      wordObj._backgroundAnimationId = null;
    }


    if (!wordObj._backgroundRect) {
      return;
    }


    if (fromColor === toColor) {
      if (toColor === 'transparent') {
        wordObj._backgroundRect.set({ fill: 'transparent', opacity: 0 });
      } else {
        wordObj._backgroundRect.set({ fill: toColor, opacity: 1 });
      }
      this.canvas.requestRenderAll();
      return;
    }


    wordObj._isAnimatingBackground = true;


    const startTime = performance.now();

    const animate = currentTime => {

      if (!wordObj._isAnimatingBackground || !wordObj._backgroundRect) {
        return;
      }

      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);


      const easedProgress = 1 - Math.pow(1 - progress, 3);

      if (progress < 1) {

        if (fromColor === 'transparent' && toColor !== 'transparent') {

          const opacity = easedProgress;
          wordObj._backgroundRect.set({
            fill: toColor,
            opacity: opacity,
          });
        } else if (fromColor !== 'transparent' && toColor === 'transparent') {

          const opacity = 1 - easedProgress;
          wordObj._backgroundRect.set({
            fill: fromColor,
            opacity: opacity,
          });
        } else {

          wordObj._backgroundRect.set({
            fill: toColor,
            opacity: 1,
          });
        }


        this.syncBackgroundPosition(wordObj);
        this.canvas.requestRenderAll();
        wordObj._backgroundAnimationId = requestAnimationFrame(animate);
      } else {

        if (toColor === 'transparent') {
          wordObj._backgroundRect.set({ fill: 'transparent', opacity: 0 });
        } else {
          wordObj._backgroundRect.set({ fill: toColor, opacity: 1 });
        }
        wordObj._backgroundAnimationId = null;
        wordObj._isAnimatingBackground = false;
        this.canvas.requestRenderAll();
      }
    };

    wordObj._backgroundAnimationId = requestAnimationFrame(animate);
  }

  hexToRgb(hex) {

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 255, g: 215, b: 0 }
  }

  syncBackgroundPosition(wordObj) {

    if (wordObj._backgroundRect && wordObj._backgroundRect._textObject) {
      const textObj = wordObj._backgroundRect._textObject;
      const horizontalPadding = Math.max(6, textObj.fontSize * 0.1);
      const verticalPadding = Math.max(4, textObj.fontSize * 0.08);

      wordObj._backgroundRect.set({
        left: textObj.left - horizontalPadding,
        top: textObj.top - verticalPadding,
      });
    }
  }

  updateWordZIndex(element) {
    if (
      !element.properties.wordObjects ||
      element.properties.wordObjects.length === 0
    ) {
      return;
    }


    const shadow = element.properties.shadow;
    if (!shadow || (shadow.offsetX === 0 && shadow.offsetY === 0)) {
      return;
    }


    let shadowAngle =
      Math.atan2(shadow.offsetY, shadow.offsetX) * (180 / Math.PI);

    if (shadowAngle < 0) {
      shadowAngle += 360;
    }


    const sortedWords = [...element.properties.wordObjects]
      .map((wordObj, index) => ({ wordObj, index, left: wordObj.left }))
      .sort((a, b) => a.left - b.left);




    const shadowGoesLeft = shadowAngle > 90 && shadowAngle < 270;

    if (!shadowGoesLeft) {

      sortedWords.forEach((item, index) => {
        if (item.wordObj && this.canvas.contains(item.wordObj)) {

          this.canvas.bringToFront(item.wordObj);
        }
      });
    } else {

      sortedWords.reverse().forEach((item, index) => {
        if (item.wordObj && this.canvas.contains(item.wordObj)) {

          this.canvas.bringToFront(item.wordObj);
        }
      });
    }
  }

  updateWordObjectsPositions(element, textObject) {
    const words = element.properties.words;
    const wordObjects = element.properties.wordObjects;

    if (!words || !wordObjects) return;


    const baseSpaceWidth = textObject.fontSize / 3;
    const spaceWidth =
      baseSpaceWidth + this.subtitlesPanelState.wordSpacingFactor;


    const originalWidth = textObject.width;
    const originalLeft = textObject.left;
    const originalTop = textObject.top;


    const { lines, lineHeights } = this.calculateWordLines(
      words,
      textObject,
      originalWidth,
      spaceWidth
    );


    const totalLinesHeight = lineHeights.reduce(
      (sum, height) => sum + height,
      0
    );
    const originalTotalHeight = lineHeights.length * textObject.fontSize;
    const totalExtraSpace = totalLinesHeight - originalTotalHeight;
    const startingTopAdjustment = -totalExtraSpace / 2


    let wordIndex = 0;
    let currentTop = originalTop + startingTopAdjustment;

    lines.forEach((line, lineIndex) => {
      const lineLeft = this.calculateLineStartPosition(
        line,
        originalLeft,
        originalWidth,
        textObject.textAlign,
        spaceWidth
      );


      const lineHeight = lineHeights[lineIndex] || textObject.fontSize;
      const extraSpace = lineHeight - textObject.fontSize;
      const verticalOffset = extraSpace / 2
      const adjustedTop = currentTop + verticalOffset;

      let currentLeft = lineLeft;
      line.forEach((wordData, lineWordIndex) => {
        const wordObj = wordObjects[wordIndex];
        if (wordObj) {
          wordObj.set({
            left: currentLeft,
            top: adjustedTop
          });
          wordObj.setCoords();
        }
        currentLeft +=
          wordData.width + (lineWordIndex < line.length - 1 ? spaceWidth : 0);
        wordIndex++;
      });
      currentTop += lineHeight
    });


    if (element.subType === 'subtitles') {
      this.createSubtitleBackground(element, textObject);
    }
  }

  updateWordObjects(element, textObject) {
    const words = element.properties.words;
    const wordObjects = element.properties.wordObjects;


    wordObjects.forEach(wordObj => {
      if (!wordObj) return;

      wordObj.set({
        fontSize: textObject.fontSize,
        fontWeight: textObject.fontWeight,
        fontFamily: textObject.fontFamily,
        fontStyle: textObject.fontStyle || 'normal',
        fill: textObject.fill,
        stroke: textObject.stroke,
        strokeWidth: textObject.strokeWidth,
        strokeMiterLimit: textObject.strokeMiterLimit,
        shadow: textObject.shadow,
        textAlign: 'left',
        originX: 'left',
        originY: textObject.originY,
        paintFirst: textObject.paintFirst,
        opacity: 0,
        selectable: false,
        evented: false,
        objectCaching: true,
        backgroundColor: 'transparent',
        charSpacing: this.subtitlesPanelState.letterSpacingFactor || 0,
        lineHeight: this.subtitlesPanelState.lineHeightFactor || 1.2,
      });


      const fontString = `${textObject.fontStyle || 'normal'} ${
        textObject.fontWeight || 'normal'
      } ${textObject.fontSize || 12}px ${textObject.fontFamily || 'Arial'}`;
      wordObj.set('font', fontString);


      wordObj.parentProperties = {
        backgroundColor: textObject.backgroundColor,
        backgroundRadius: textObject.backgroundRadius,
      };


      if (wordObj.backgroundObject) {

        if (this.canvas.contains(wordObj.backgroundObject)) {
          this.canvas.remove(wordObj.backgroundObject);
        }
        wordObj.backgroundObject = null;
      }


      const background = this.createWordBackground(
        wordObj,
        wordObj.parentProperties
      );
      if (background) {
        this.canvas.add(background);
        wordObj.backgroundObject = background;
      }
    });


    const baseSpaceWidth = textObject.fontSize / 3;
    const spaceWidth =
      baseSpaceWidth + this.subtitlesPanelState.wordSpacingFactor;


    const originalWidth = textObject.width;
    const originalLeft = textObject.left;
    const originalTop = textObject.top;


    const { lines, lineHeights } = this.calculateWordLines(
      words,
      textObject,
      originalWidth,
      spaceWidth
    );


    const totalLinesHeight = lineHeights.reduce(
      (sum, height) => sum + height,
      0
    );
    const originalTotalHeight = lineHeights.length * textObject.fontSize;
    const totalExtraSpace = totalLinesHeight - originalTotalHeight;
    const startingTopAdjustment = -totalExtraSpace / 2


    let wordIndex = 0;
    let currentTop = originalTop + startingTopAdjustment;

    lines.forEach((line, lineIndex) => {
      const lineLeft = this.calculateLineStartPosition(
        line,
        originalLeft,
        originalWidth,
        textObject.textAlign,
        spaceWidth
      );


      const lineHeight = lineHeights[lineIndex] || textObject.fontSize;
      const extraSpace = lineHeight - textObject.fontSize;
      const verticalOffset = extraSpace / 2
      const adjustedTop = currentTop + verticalOffset;

      let currentLeft = lineLeft;
      line.forEach((wordData, lineWordIndex) => {
        const wordObj = wordObjects[wordIndex];
        if (wordObj) {
          wordObj.set({
            left: currentLeft,
            top: adjustedTop
          });
          wordObj.setCoords();


        }
        currentLeft +=
          wordData.width + (lineWordIndex < line.length - 1 ? spaceWidth : 0);
        wordIndex++;
      });
      currentTop += lineHeight
    });


    if (element.subType === 'subtitles') {
      this.createSubtitleBackground(element, textObject);
    }

    this.canvas.requestRenderAll();
  }

  createWordObject(word, left, top, parentObject) {
    const textObject = new fabric.Text(word.word || word.text || '', {
      left: left,
      top: top,
      fontSize: parentObject.fontSize,
      fontWeight: parentObject.fontWeight,
      fontFamily: parentObject.fontFamily,
      fontStyle: parentObject.fontStyle || 'normal',
      fill: parentObject.fill,
      stroke: parentObject.stroke,
      strokeWidth: parentObject.strokeWidth,
      strokeMiterLimit: parentObject.strokeMiterLimit,
      shadow: parentObject.shadow,
      textAlign: 'left',
      originX: 'left',
      originY: parentObject.originY,
      paintFirst: parentObject.paintFirst,
      opacity: 0,
      selectable: false,
      evented: false,
      objectCaching: true,
      backgroundColor: 'transparent',
      charSpacing: this.subtitlesPanelState.letterSpacingFactor || 0,
      lineHeight: this.subtitlesPanelState.lineHeightFactor || 1.2,
    });


    const fontString = `${parentObject.fontStyle || 'normal'} ${
      parentObject.fontWeight || 'normal'
    } ${parentObject.fontSize || 12}px ${parentObject.fontFamily || 'Arial'}`;
    textObject.set('font', fontString);

    return textObject;
  }

  createWordBackground(textObject, parentProperties) {
























  }

  createSubtitleBackground(element, textObject) {
    const props = element.properties;


    if (
      element.backgroundObject &&
      this.canvas.contains(element.backgroundObject)
    ) {
      this.canvas.remove(element.backgroundObject);
      element.backgroundObject = null;
    }

    const padding = 16;
    const backgroundRadius = props.backgroundRadius || 0;


    const textBounds = textObject.getBoundingRect();

    const backgroundRect = new fabric.Rect({
      left: textBounds.left - padding,
      top: textBounds.top - padding / 2,
      width: textBounds.width + padding * 2,
      height: textBounds.height + padding,
      fill: props.backgroundColor,
      opacity: props.backgroundOpacity || 0.5,
      rx: backgroundRadius,
      ry: backgroundRadius,
      selectable: false,
      evented: false,
      objectCaching: true,
      name: `${element.id}_background`,
    });


    this.canvas.add(backgroundRect);



    let minIndex = this.canvas.getObjects().length;


    if (element.fabricObject && this.canvas.contains(element.fabricObject)) {
      const textIndex = this.canvas.getObjects().indexOf(element.fabricObject);
      if (textIndex !== -1) {
        minIndex = Math.min(minIndex, textIndex);
      }
    }


    if (element.properties.wordObjects) {
      element.properties.wordObjects.forEach(wordObj => {
        if (wordObj && this.canvas.contains(wordObj)) {
          const wordIndex = this.canvas.getObjects().indexOf(wordObj);
          if (wordIndex !== -1) {
            minIndex = Math.min(minIndex, wordIndex);
          }
        }
      });
    }



    backgroundRect.sendToBack();


    if (
      element.properties.wordObjects &&
      element.properties.wordObjects.length > 0
    ) {
      element.properties.wordObjects.forEach(wordObj => {
        if (wordObj && this.canvas.contains(wordObj)) {
          this.canvas.bringToFront(wordObj);
        }
      });
    }


    if (
      element.fabricObject &&
      this.canvas.contains(element.fabricObject) &&
      element.fabricObject.opacity > 0
    ) {
      this.canvas.bringToFront(element.fabricObject);
    }

    element.backgroundObject = backgroundRect;
  }


  setStoryId(id) {
    this.storyId = id;
  }

  setInitializationState(state) {
    this.isInitializationInProgress = state;
  }

  async restoreElementsFromBackend({ editorElements }) {
    const batchSize = 5;
    const batches = [];

    for (let i = 0; i < editorElements.length; i += batchSize) {
      batches.push(editorElements.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      await Promise.all(
        batch.map(async element => {
          if (element.subType && element.subType === 'subtitles') {
            return;
          }

          switch (element.type) {
            case 'audio':
              await this.addExistingAudio({
                id: element.id,
                base64Audio: element.properties.src,
                row: element.row,
                startTime: element.timeFrame.start,
                durationMs: element.timeFrame.end - element.timeFrame.start,
                duration: element.duration,
                audioType: element.properties?.audioType,
                audioOffset: element.properties?.audioOffset,
                properties: element.properties,
                autoSubtitles: element.properties?.autoSubtitles,
                text: element.properties?.text,
              });
              break;

            case 'imageUrl':
              await this.setImageOnCanvas({
                url: element.properties.src,
                element: {
                  id: element.id,
                  name: element.name,
                  type: element.type,
                  pointId: element.pointId,
                  sentence: element.sentence,
                  placement: element.placement,
                  timeFrame: element.timeFrame,
                  subType: element.subType,
                  row: element.row,
                  from: element.from,
                  properties: element.properties,
                  initialState: element.initialState || {
                    scaleX: element.placement?.scaleX || 1,
                    scaleY: element.placement?.scaleY || 1,
                    left: element.placement?.x || 0,
                    top: element.placement?.y || 0,
                    opacity: 1.0,
                  },
                },
              });
              break;

            case 'text':
              await this.addTextOnCanvas({
                imageId: element.imageId,
                pointId: element.pointId,
                sentence: element.sentence,
                point: element.point,
                text: element.properties.text,
                placement: element.placement,
                timeFrame: element.timeFrame,
                row: element.row,
                properties: {
                  ...element.properties,
                },
                timelineOnly: false,
              });
              break;

            case 'video':
              await this.addExistingVideo({
                src: element.properties.src,
                id: element.id,
                name: element.name,
                row: element.row,
                startTime: element.timeFrame.start,
                duration: element.timeFrame.end - element.timeFrame.start,
                width: element.properties.width,
                height: element.properties.height,
                placement: element.placement,
                properties: element.properties,
                timeFrame: element.timeFrame,
              });
              break;

            default:
              break;
          }
        })
      );

      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  async mergeVoiceOvers(voiceElements) {
    try {
      let currentStartTime = 0;


      for (let i = 0; i < voiceElements.length; i++) {
        const { url, duration } = voiceElements[i];

        this.addExistingAudio({
          id: `vo-${i}-${Date.now()}`,
          base64Audio: url,
          name: `Voice Over ${i + 1}`,
          row: 2,
          startTime: currentStartTime,
          durationMs: duration,
          duration: duration,
          audioType: 'voiceover',
          sentenceId: voiceElements[i].sentenceId,
        });

        currentStartTime += duration;
      }
    } catch (error) {
      console.error('Error adding voice overs:', error);
      throw error;
    }
  }

  recalculateElementsForSentence(sentenceId, newPointId) {
    const sentenceElements = this.editorElements.filter(
      el => el.sentence?._id === sentenceId
    );

    if (sentenceElements.length === 0) return;

    const sentenceTimeFrame = {
      start: Math.min(...sentenceElements.map(el => el.timeFrame.start)),
      end: Math.max(...sentenceElements.map(el => el.timeFrame.end)),
    };

    const sentenceDuration = sentenceTimeFrame.end - sentenceTimeFrame.start;

    const pointGroups = sentenceElements.reduce((groups, element) => {
      const pointId = element.pointId;
      if (!groups[pointId]) {
        groups[pointId] = [];
      }
      groups[pointId].push(element);
      return groups;
    }, {});

    const pointCount = Object.keys(pointGroups).length;

    const newPointDuration = sentenceDuration / pointCount;

    let currentStartTime = sentenceTimeFrame.start;

    Object.entries(pointGroups).forEach(([pointId, elements]) => {
      const newTimeFrame = {
        start: currentStartTime,
        end: currentStartTime + newPointDuration,
      };

      elements.forEach(element => {
        if (element.type === 'audio') {
          const currentOffset = element.properties.audioOffset || 0;
          const timeDiff = newTimeFrame.start - element.timeFrame.start;
          element.properties.audioOffset = currentOffset + timeDiff;
        }

        element.timeFrame = { ...newTimeFrame };
      });

      currentStartTime += newPointDuration;
    });

    this.refreshElements();
    this.refreshAnimations();
  }

  createElementForNewPoint(point, sentenceId) {
    const sentenceElements = this.editorElements.filter(
      el => el.sentence?._id === sentenceId
    );

    if (sentenceElements.length === 0) return;

    const sentenceTimeFrame = {
      start: Math.min(...sentenceElements.map(el => el.timeFrame.start)),
      end: Math.max(...sentenceElements.map(el => el.timeFrame.end)),
    };

    const sentence = sentenceElements[0].sentence;

    this.addImageToCanvas({
      store: this,
      url: point.selectedImage?.googleCloudUrl || '',
      minUrl: point.selectedImage?.minGoogleCloudUrl || '',
      imageId: point._id,
      startTime: sentenceTimeFrame.start,
      endTime: sentenceTimeFrame.end,
      pointId: point._id,
      point: point,
      sentence: sentence,
      storyId: sentence.storyId,
    });

    if (this.editorElements.find(el => el.subType === 'subtitles')) {
      return;
    }

    this.addText({
      text: point.point || '',
      startTime: sentenceTimeFrame.start,
      endTime: sentenceTimeFrame.end,
      imageId: point._id,
      pointId: point._id,
      sentence: sentence,
      point: point,
      storyId: sentence.storyId,
    });
  }


  clearAudio() {
    runInAction(() => {

      this.audios = [];


      this.editorElements = this.editorElements.filter(
        element => element.type !== 'audio'
      );


      if (this.canvas) {
        this.canvas.requestRenderAll();
      }
    });
  }


  addDrawnPath(path) {
    if (path) {
      this.drawnPaths.push(path);
    }


  }


  clearDrawnPaths() {
    if (this.canvas) {
      const drawingObjects = this.canvas
        .getObjects()
        .filter(obj => obj.type === 'line' || obj.type === 'path');

      if (drawingObjects.length > 0) {
        this.canvas.remove(...drawingObjects);
        this.canvas.renderAll();
      }

      this.drawnPaths = [];
    }
  }

  clearGuidelines() {
    if (this.guideline && this.canvas) {

      const guidelineObjects = this.canvas
        .getObjects()
        .filter(obj => obj.guidelineLine);

      if (guidelineObjects.length > 0) {
        this.canvas.remove(...guidelineObjects);
        this.canvas.renderAll();
      }
    }
  }

  updateImageCrop(imageObject) {
    if (!imageObject) return;

    let elementToUpdate = null;
    if (imageObject.name) {
      elementToUpdate = this.editorElements.find(
        el => el.id === imageObject.name
      );
    }

    if (!elementToUpdate && imageObject.id) {
      elementToUpdate = this.editorElements.find(
        el => el.id === imageObject.id
      );
    }

    if (!elementToUpdate) {
      elementToUpdate = this.editorElements.find(
        el =>
          (el.type === 'image' || el.type === 'imageUrl') &&
          (el.imageId === imageObject.id ||
            el.properties?.imageId === imageObject.id)
      );
    }

    if (elementToUpdate) {
      const updatedElement = {
        ...elementToUpdate,
        placement: {
          ...elementToUpdate.placement,
          x: imageObject.left,
          y: imageObject.top,
          width: imageObject.width * (imageObject.scaleX || 1),
          height: imageObject.height * (imageObject.scaleY || 1),
          scaleX: imageObject.scaleX,
          scaleY: imageObject.scaleY,
          cropX: imageObject.cropX,
          cropY: imageObject.cropY,
        },
      };

      this.editorElements = this.editorElements.map(el =>
        el.id === updatedElement.id ? updatedElement : el
      );
    }
  }


  getAudioResourceById(id) {

    const editorElement = this.editorElements.find(
      el => el.id === id && el.type === 'audio'
    );
    if (editorElement) {
      return editorElement;
    }



    const audioElement = this.audioResources.find(a => a.id === id);
    return audioElement;
  }

  shiftElementsAfterRemoval(removedElement) {
    return;
  }

  setAutoAdjustDuration(value) {
    this.autoAdjustDuration = value;
  }

  compactAudioElements() {

    this.setInitializationState(true);


    const scaleStr =
      document.documentElement.style.getPropertyValue('--scale-factor');
    const initialScale = scaleStr
      ? Math.round(parseFloat(scaleStr) * 100) / 100
      : 1;
    const initialDuration = this.lastElementEnd;

    try {
      let hasGaps = true;
      let iterationCount = 0;
      const MAX_ITERATIONS = 100;

      while (hasGaps && iterationCount < MAX_ITERATIONS) {

        const audioElements = this.editorElements.filter(
          el => el.type === 'audio'
        );

        if (audioElements.length === 0) return;


        const elementsByRow = audioElements.reduce((acc, element) => {
          if (!acc[element.row]) {
            acc[element.row] = [];
          }
          acc[element.row].push(element);
          return acc;
        }, {});


        const allGaps = [];
        Object.entries(elementsByRow).forEach(([row, elements]) => {

          const sortedElements = elements.sort(
            (a, b) => a.timeFrame.start - b.timeFrame.start
          );


          if (sortedElements[0].timeFrame.start > 0) {
            allGaps.push({
              row: parseInt(row),
              start: 0,
              end: sortedElements[0].timeFrame.start,
              duration: sortedElements[0].timeFrame.start,
            });
          }


          for (let i = 0; i < sortedElements.length - 1; i++) {
            const currentEnd = sortedElements[i].timeFrame.end;
            const nextStart = sortedElements[i + 1].timeFrame.start;
            if (nextStart > currentEnd) {
              allGaps.push({
                row: parseInt(row),
                start: currentEnd,
                end: nextStart,
                duration: nextStart - currentEnd,
              });
            }
          }


          const lastElement = sortedElements[sortedElements.length - 1];
          const lastElementEnd = lastElement.timeFrame.end;
          const rowEndTime = Math.max(
            ...this.editorElements.map(el => el.timeFrame.end)
          );
          if (lastElementEnd < rowEndTime) {
            allGaps.push({
              row: parseInt(row),
              start: lastElementEnd,
              end: rowEndTime,
              duration: rowEndTime - lastElementEnd,
            });
          }
        });


        if (allGaps.length === 0) {
          hasGaps = false;
          break;
        }


        allGaps.sort((a, b) => a.start - b.start);


        const gap = allGaps[0];


        const nonAudioElements = this.editorElements.filter(
          el => el.type !== 'audio'
        );


        nonAudioElements.forEach(element => {
          const originalStart = element.timeFrame.start;
          const originalEnd = element.timeFrame.end;
          const originalDuration = originalEnd - originalStart;


          if (element.timeFrame.start >= gap.end) {
            element.timeFrame.start -= gap.duration;
            element.timeFrame.end -= gap.duration;


            if (
              element.type === 'text' &&
              element.subType === 'subtitles' &&
              element.properties.words
            ) {
              element.properties.words = element.properties.words.map(word => ({
                ...word,
                start: word.start - gap.duration,
                end: word.end - gap.duration,
              }));
            }
          }

          else if (
            element.timeFrame.start < gap.end &&
            element.timeFrame.end > gap.start
          ) {

            const overlapStart = Math.max(element.timeFrame.start, gap.start);
            const overlapEnd = Math.min(element.timeFrame.end, gap.end);
            const overlapDuration = overlapEnd - overlapStart;


            let newStart = element.timeFrame.start;
            let newEnd = element.timeFrame.end;


            if (
              element.timeFrame.start < gap.start &&
              element.timeFrame.end > gap.end
            ) {
              newEnd -= overlapDuration;
            }

            else if (
              element.timeFrame.start < gap.start &&
              element.timeFrame.end <= gap.end
            ) {
              newEnd = gap.start;
            }

            else if (
              element.timeFrame.start >= gap.start &&
              element.timeFrame.end > gap.end
            ) {
              newStart = gap.start;
              newEnd = gap.start + (element.timeFrame.end - gap.end);
            }

            else if (
              element.timeFrame.start >= gap.start &&
              element.timeFrame.end <= gap.end
            ) {
              newStart = gap.start;
              newEnd = gap.start + Math.min(originalDuration, gap.duration);
            }

            element.timeFrame.start = newStart;
            element.timeFrame.end = newEnd;


            if (
              element.type === 'text' &&
              element.subType === 'subtitles' &&
              element.properties.words
            ) {
              const timeScale = (newEnd - newStart) / originalDuration;

              element.properties.words = element.properties.words.map(word => {
                const relativePos =
                  (word.start - originalStart) / originalDuration;
                const newWordStart =
                  newStart + (newEnd - newStart) * relativePos;
                const newWordDuration = (word.end - word.start) * timeScale;

                return {
                  ...word,
                  start: Math.round(newWordStart),
                  end: Math.round(newWordStart + newWordDuration),
                };
              });
            }
          }
        });


        audioElements.forEach(element => {

          if (element.timeFrame.start >= gap.end) {
            element.timeFrame.start -= gap.duration;
            element.timeFrame.end -= gap.duration;
          }

          else if (
            element.timeFrame.start < gap.end &&
            element.timeFrame.end > gap.start
          ) {

            const originalDuration =
              element.timeFrame.end - element.timeFrame.start;


            if (element.timeFrame.start < gap.start) {

              element.timeFrame.end =
                element.timeFrame.start + originalDuration;
            }

            else if (element.timeFrame.start >= gap.start) {

              element.timeFrame.start = gap.start;
              element.timeFrame.end = gap.start + originalDuration;
            }
          }


          if (element.properties.audioOffset !== undefined) {

            if (element.timeFrame.start >= gap.end) {

              element.properties.audioOffset = Math.max(
                0,
                element.properties.audioOffset
              );
            }
          }
        });

        iterationCount++;
      }


      const buffer = Math.max(30000, this.lastElementEnd * 0.2);
      this.maxTime = this.lastElementEnd + buffer;


      const finalDuration = this.lastElementEnd;
      const durationRatio = finalDuration / initialDuration;
      const newScale = Math.max(1, Math.min(30, initialScale * durationRatio));
      const adjustedScale = Math.round(newScale * 100) / 100;


      this.updateAudioElements();


      this.refreshElements();


      requestAnimationFrame(() => {
        document.documentElement.style.setProperty(
          '--scale-factor',
          adjustedScale.toString()
        );


        const scaleRange = document.querySelector(
          'input[type="range"].zoomRange'
        );
        if (scaleRange) {
          scaleRange.value = adjustedScale;
          const percentage = Math.round(((adjustedScale - 1) / (30 - 1)) * 100);
          scaleRange.style.setProperty('--range-progress', `${percentage}%`);
        }
      });
    } finally {

      this.setInitializationState(false);
    }
  }

  async testAvailableCodecs() {
    const codecOptions = {
      mp4: [

        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=avc1.42E01F',
        'video/mp4;codecs=avc1.42E020',
        'video/mp4;codecs=avc1.42E028',
        'video/mp4;codecs=avc1.42001E',
        'video/mp4;codecs=avc1.42001F',


        'video/mp4;codecs=avc1.4D401E',
        'video/mp4;codecs=avc1.4D401F',
        'video/mp4;codecs=avc1.4D4020',
        'video/mp4;codecs=avc1.4D4028',
        'video/mp4;codecs=avc1.4D4029',
        'video/mp4;codecs=avc1.4D402A',


        'video/mp4;codecs=avc1.640028',
        'video/mp4;codecs=avc1.640029',
        'video/mp4;codecs=avc1.64002A',
        'video/mp4;codecs=avc1.640015',
        'video/mp4;codecs=avc1.640016',
        'video/mp4;codecs=avc1.640020',


        'video/mp4;codecs=avc1.6E0028',
        'video/mp4;codecs=avc1.6E0029',
        'video/mp4;codecs=avc1.6E002A',


        'video/mp4;codecs=avc1.7A0028',
        'video/mp4;codecs=avc1.7A0029',
        'video/mp4;codecs=avc1.7A002A',


        'video/mp4;codecs=avc1.F40028',
        'video/mp4;codecs=avc1.F40029',
        'video/mp4;codecs=avc1.F4002A',


        'video/mp4;codecs=h264',
        'video/mp4;codecs=H264',
        'video/mp4;codecs=avc1',


        'video/mp4;codecs=hevc',
        'video/mp4;codecs=hev1',
        'video/mp4;codecs=hvc1',


        'video/mp4;codecs=mp4v.20.8',
        'video/mp4;codecs=mp4v.20.240',
        'video/mp4;codecs=avc1.42801E',
        'video/mp4;codecs=avc1.42001E',


        'video/mp4',
      ],
      webm: [

        'video/webm;codecs=vp8',
        'video/webm;codecs=vp8.0',
        'video/webm;codecs=vp8,vorbis',


        'video/webm;codecs=vp9',
        'video/webm;codecs=vp9.0',
        'video/webm;codecs=vp9.1',
        'video/webm;codecs=vp9.2',
        'video/webm;codecs=vp9.3',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp9,vorbis',


        'video/webm;codecs=av1',
        'video/webm;codecs=av1.0',
        'video/webm;codecs=av1.1',
        'video/webm;codecs=av1.2',
        'video/webm;codecs=av1.0.00M.08',
        'video/webm;codecs=av1.0.01M.08',
        'video/webm;codecs=av1.0.00M.10',
        'video/webm;codecs=av1.0.00M.12',
        'video/webm;codecs=av1,opus',
        'video/webm;codecs=av1,vorbis',


        'video/webm;codecs=vp10',
        'video/webm;codecs=daala',


        'video/webm',
      ],
    };


    const formatSupport = codec => {
      const isSupported = MediaRecorder.isTypeSupported(codec);
      return `${codec}: ${isSupported ? '✅' : '❌'}`;
    };


    const selectedFormat = this.selectedVideoFormat;
    const supportedCodecs = codecOptions[selectedFormat].filter(codec =>
      MediaRecorder.isTypeSupported(codec)
    );

    if (supportedCodecs.length > 0) {

      const testStream = new MediaStream();
      const recorder = new MediaRecorder(testStream, {
        mimeType: supportedCodecs[0],
      });
    } else {
    }
  }


  startOriginSelection(element, callback) {

    if (!element || !element.fabricObject || !this.canvas) {
      console.error(
        'Cannot start origin selection: Invalid element, missing fabricObject, or no canvas'
      );
      return;
    }


    if (this.isSelectingOrigin) {
      this.cleanupOriginSelection();
    }

    this.isSelectingOrigin = true;
    this.originSelectionElement = element;
    this.originSelectionCallback = callback;


    this.canvas.getObjects().forEach(obj => {
      if (obj !== this.originMarker) {
        obj.selectable = false;
        obj.evented = false;
      }
    });


    let initialPosition = {
      x:
        element.fabricObject.left +
        (element.fabricObject.width * element.fabricObject.scaleX) / 2,
      y:
        element.fabricObject.top +
        (element.fabricObject.height * element.fabricObject.scaleY) / 2,
    };


    if (element.properties?.origin?.type === 'custom') {
      initialPosition = {
        x: element.properties.origin.absoluteX,
        y: element.properties.origin.absoluteY,
      };
    }


    if (!this.originMarker) {
      this.originMarker = new fabric.Group(
        [
          new fabric.Circle({
            radius: 48,
            fill: 'rgba(33, 150, 243, 0.2)',
            stroke: '#2196F3',
            strokeWidth: 2,
            originX: 'center',
            originY: 'center',
          }),
          new fabric.Circle({
            radius: 36,
            fill: '#2196F3',
            originX: 'center',
            originY: 'center',
          }),
          new fabric.Line([-36, 0, 36, 0], {
            stroke: '#2196F3',
            strokeWidth: 2,
            originX: 'center',
            originY: 'center',
          }),
          new fabric.Line([0, -36, 0, 36], {
            stroke: '#2196F3',
            strokeWidth: 2,
            originX: 'center',
            originY: 'center',
          }),
        ],
        {
          left: initialPosition.x,
          top: initialPosition.y,
          selectable: true,
          evented: true,
          originX: 'center',
          originY: 'center',
          hasControls: false,
          hasBorders: false,
          lockRotation: true,
        }
      );


      this.originMarker.on('moving', () => {
        const marker = this.originMarker;
        const markerRadius = 48;


        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;


        let left = marker.left;
        let top = marker.top;


        if (left < markerRadius) {
          left = markerRadius;
        } else if (left > canvasWidth - markerRadius) {
          left = canvasWidth - markerRadius;
        }


        if (top < markerRadius) {
          top = markerRadius;
        } else if (top > canvasHeight - markerRadius) {
          top = canvasHeight - markerRadius;
        }


        marker.set({
          left: left,
          top: top,
        });

        this.canvas.requestRenderAll();
      });


      this.originMarker.on('modified', () => {
        const marker = this.originMarker;
        const markerRadius = 48;


        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;


        let left = Math.min(
          Math.max(marker.left, markerRadius),
          canvasWidth - markerRadius
        );
        let top = Math.min(
          Math.max(marker.top, markerRadius),
          canvasHeight - markerRadius
        );

        const currentPosition = {
          x: left,
          y: top,
        };

        const fabricObject = element.fabricObject;
        const elementLeft = fabricObject.left;
        const elementTop = fabricObject.top;
        const elementWidth = fabricObject.width * fabricObject.scaleX;
        const elementHeight = fabricObject.height * fabricObject.scaleY;

        const relativeX =
          ((currentPosition.x - elementLeft) / elementWidth) * 100;
        const relativeY =
          ((currentPosition.y - elementTop) / elementHeight) * 100;

        const customOrigin = {
          type: 'custom',
          x: Math.max(0, Math.min(100, relativeX)),
          y: Math.max(0, Math.min(100, relativeY)),
          absoluteX: currentPosition.x,
          absoluteY: currentPosition.y,
        };


        marker.set({
          left: currentPosition.x,
          top: currentPosition.y,
        });


        if (element.properties) {
          element.properties.origin = customOrigin;
        }

        if (this.originSelectionCallback) {
          this.originSelectionCallback(customOrigin);
        }
      });


      this.originMarker.on('mouseup', () => {
        const marker = this.originMarker;
        const markerRadius = 48;


        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;


        let left = Math.min(
          Math.max(marker.left, markerRadius),
          canvasWidth - markerRadius
        );
        let top = Math.min(
          Math.max(marker.top, markerRadius),
          canvasHeight - markerRadius
        );


        marker.set({
          left: left,
          top: top,
        });

        this.canvas.requestRenderAll();
      });


      this.canvas.add(this.originMarker);
      this.canvas.setActiveObject(this.originMarker);
    } else {

      this.originMarker.set({
        left: initialPosition.x,
        top: initialPosition.y,
      });
      this.canvas.setActiveObject(this.originMarker);
    }

    this.canvas.requestRenderAll();
  }

  cleanupOriginSelection = () => {

    this.isSelectingOrigin = false;
    this.originSelectionElement = null;
    this.originSelectionCallback = null;


    if (this.canvas) {
      this.canvas.getObjects().forEach(obj => {
        obj.selectable = true;
        obj.evented = true;
      });
      this.canvas.requestRenderAll();
    }


    if (this.originMarker && !this.isSelectingOrigin) {
      this.canvas.remove(this.originMarker);
      this.canvas.renderAll();
      this.originMarker = null;
    }
  };

  cancelOriginSelection = () => {
    this.cleanupOriginSelection();
  };

  handleOriginSelection = event => {
    if (
      !this.isSelectingOrigin ||
      !this.originSelectionElement ||
      !this.originSelectionCallback ||
      !this.originMarker ||
      !this.canvas
    )
      return;


    if (this.originMarker.dragging) return;

    const markerRadius = 48;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;


    let left = event.e.offsetX;
    let top = event.e.offsetY;


    if (left < markerRadius) {
      left = markerRadius;
    } else if (left > canvasWidth - markerRadius) {
      left = canvasWidth - markerRadius;
    }


    if (top < markerRadius) {
      top = markerRadius;
    } else if (top > canvasHeight - markerRadius) {
      top = canvasHeight - markerRadius;
    }

    const element = this.originSelectionElement;
    const fabricObject = element.fabricObject;

    if (!fabricObject) return;


    const elementLeft = fabricObject.left;
    const elementTop = fabricObject.top;
    const elementWidth = fabricObject.width * fabricObject.scaleX;
    const elementHeight = fabricObject.height * fabricObject.scaleY;


    const relativeX = ((left - elementLeft) / elementWidth) * 100;
    const relativeY = ((top - elementTop) / elementHeight) * 100;


    const customOrigin = {
      type: 'custom',
      x: Math.max(0, Math.min(100, relativeX)),
      y: Math.max(0, Math.min(100, relativeY)),
      absoluteX: left,
      absoluteY: top,
    };


    this.originMarker.set({
      left: left,
      top: top,
    });


    this.originSelectionCallback(customOrigin);

    this.canvas.requestRenderAll();
  };


  calculatePositionFromOrigin(fabricObject, origin, scale = 1) {
    if (!fabricObject) return { left: 0, top: 0 };

    const initialWidth = fabricObject.width * fabricObject.scaleX;
    const initialHeight = fabricObject.height * fabricObject.scaleY;
    const scaledWidth = fabricObject.width * scale;
    const scaledHeight = fabricObject.height * scale;

    let adjustLeft = fabricObject.left;
    let adjustTop = fabricObject.top;

    if (
      origin?.type === 'custom' &&
      typeof origin.x === 'number' &&
      typeof origin.y === 'number'
    ) {

      const originX = (origin.x / 100) * initialWidth;
      const originY = (origin.y / 100) * initialHeight;


      const scaledOriginX = (origin.x / 100) * scaledWidth;
      const scaledOriginY = (origin.y / 100) * scaledHeight;

      adjustLeft = fabricObject.left + (originX - scaledOriginX);
      adjustTop = fabricObject.top + (originY - scaledOriginY);
    } else {

      switch (origin) {
        case 'center':
          adjustLeft = fabricObject.left + (initialWidth - scaledWidth) / 2;
          adjustTop = fabricObject.top + (initialHeight - scaledHeight) / 2;
          break;
        case 'top':
          adjustLeft = fabricObject.left + (initialWidth - scaledWidth) / 2;
          break;
        case 'bottom':
          adjustLeft = fabricObject.left + (initialWidth - scaledWidth) / 2;
          adjustTop = fabricObject.top + (initialHeight - scaledHeight);
          break;
        case 'left':
          adjustTop = fabricObject.top + (initialHeight - scaledHeight) / 2;
          break;
        case 'right':
          adjustLeft = fabricObject.left + (initialWidth - scaledWidth);
          adjustTop = fabricObject.top + (initialHeight - scaledHeight) / 2;
          break;
        case 'top-left':
          break
        case 'top-right':
          adjustLeft = fabricObject.left + (initialWidth - scaledWidth);
          break;
        case 'bottom-left':
          adjustTop = fabricObject.top + (initialHeight - scaledHeight);
          break;
        case 'bottom-right':
          adjustLeft = fabricObject.left + (initialWidth - scaledWidth);
          adjustTop = fabricObject.top + (initialHeight - scaledHeight);
          break;
      }
    }

    return { left: adjustLeft, top: adjustTop };
  }

  restoreOriginMarker(element, origin) {
    if (!element?.fabricObject || !origin || origin?.type !== 'custom') {
      return;
    }

    if (!this.canvas) {
      return;
    }


    if (this.isSelectingOrigin) {
      return;
    }


    if (this.originMarker && this.canvas.contains(this.originMarker)) {
      this.originMarker.set({
        left: origin.absoluteX,
        top: origin.absoluteY,
      });
      this.canvas.renderAll();
      return;
    }
  }

  handleSubtitleMovement(element, newTimeFrame) {
    if (element.type !== 'text' || element.subType !== 'subtitles') return;


    const timeDiff = newTimeFrame.start - element.timeFrame.start;
    if (timeDiff === 0 && newTimeFrame.end === element.timeFrame.end) return;


    const overlapping = this.editorElements.some(
      el =>
        el.id !== element.id &&
        el.type === 'text' &&
        el.subType === 'subtitles' &&
        el.row === element.row &&
        newTimeFrame.start < el.timeFrame.end &&
        newTimeFrame.end > el.timeFrame.start
    );
    if (overlapping) {
      return;
    }


    if (element.properties.words) {
      element.properties.words = element.properties.words.map(word => ({
        ...word,
        start: word.start + timeDiff,
        end: word.end + timeDiff,
      }));
    }


    element.timeFrame = newTimeFrame;


    this.updateEditorElement(element);
  }


  handleSubtitleTrimming(element, newTimeFrame) {
    if (element.type !== 'text' || element.subType !== 'subtitles') return;

    const startDiff = newTimeFrame.start - element.timeFrame.start;
    const endDiff = newTimeFrame.end - element.timeFrame.end;


    if (element.properties.words) {
      element.properties.words = element.properties.words
        .map(word => {
          const newWord = { ...word };


          if (startDiff !== 0) {
            newWord.start = Math.max(
              newWord.start + startDiff,
              newTimeFrame.start
            );
            newWord.end = Math.max(newWord.end + startDiff, newTimeFrame.start);
          }


          if (endDiff !== 0) {
            newWord.end = Math.min(newWord.end, newTimeFrame.end);
          }

          return newWord;
        })
        .filter(word => word.end > word.start)


      element.timeFrame = newTimeFrame;
    }

    this.updateEditorElement(element);
  }

  removeAllTexts() {

    const filteredElements = this.editorElements.filter(
      element => !(element.type === 'text' && element.subType !== 'subtitles')
    );


    if (filteredElements.length !== this.editorElements.length) {
      this.setEditorElements(filteredElements);
      this.optimizedCleanupEmptyRows();
      this.refreshElements();
    }
  }


  clearHistory() {
    this.history = [];
    this.currentHistoryIndex = -1;
  }


  calculateSpacesInSortedList(sortedElementsInRow, minDuration, maxTimeForRow) {
    const availableSpaces = [];


    if (sortedElementsInRow.length === 0) {
      if (maxTimeForRow >= minDuration) {

        availableSpaces.push({
          start: 0,
          end: maxTimeForRow,
          duration: maxTimeForRow,
        });
      }
      return availableSpaces;
    }


    const firstElementStart = sortedElementsInRow[0].timeFrame.start;
    if (firstElementStart >= minDuration) {
      availableSpaces.push({
        start: 0,
        end: firstElementStart,
        duration: firstElementStart,
      });
    }


    for (let i = 0; i < sortedElementsInRow.length - 1; i++) {
      const spaceStart = sortedElementsInRow[i].timeFrame.end;
      const spaceEnd = sortedElementsInRow[i + 1].timeFrame.start;
      const spaceDuration = spaceEnd - spaceStart;

      if (spaceDuration >= minDuration) {
        availableSpaces.push({
          start: spaceStart,
          end: spaceEnd,
          duration: spaceDuration,
        });
      }
    }


    const lastElementEnd =
      sortedElementsInRow[sortedElementsInRow.length - 1].timeFrame.end;
    const endSpaceDuration = maxTimeForRow - lastElementEnd;
    if (endSpaceDuration >= minDuration) {
      availableSpaces.push({
        start: lastElementEnd,
        end: maxTimeForRow,
        duration: endSpaceDuration,
      });
    }
    return availableSpaces;
  }

  findAvailableSpaces(row, minDuration, excludeElementId) {
    const elementsInRow = this.editorElements
      .filter(el => el.row === row && el.id !== excludeElementId)
      .sort((a, b) => a.timeFrame.start - b.timeFrame.start);

    const availableSpaces = [];


    if (elementsInRow.length === 0) {
      availableSpaces.push({
        start: 0,
        end: this.maxTime,
      });
      return availableSpaces;
    }


    if (elementsInRow[0].timeFrame.start > minDuration) {
      availableSpaces.push({
        start: 0,
        end: elementsInRow[0].timeFrame.start,
      });
    }


    for (let i = 0; i < elementsInRow.length - 1; i++) {
      const spaceStart = elementsInRow[i].timeFrame.end;
      const spaceEnd = elementsInRow[i + 1].timeFrame.start;
      const spaceDuration = spaceEnd - spaceStart;

      if (spaceDuration >= minDuration) {
        availableSpaces.push({
          start: spaceStart,
          end: spaceEnd,
          duration: spaceDuration,
        });
      }
    }


    const lastElement = elementsInRow[elementsInRow.length - 1];
    if (this.maxTime - lastElement.timeFrame.end >= minDuration) {
      availableSpaces.push({
        start: lastElement.timeFrame.end,
        end: this.maxTime,
        duration: this.maxTime - lastElement.timeFrame.end,
      });
    }

    return availableSpaces;
  }

  seekWithSubtitles(newTime, preservePlayback = true) {

    const wasPlaying = preservePlayback && this.playing;
    if (wasPlaying) {
      this.setPlaying(false);
    }


    return new Promise(resolve => {
      requestAnimationFrame(() => {

        this.setCurrentTimeInMs(newTime);


        this.refreshAnimations();
        this.animationTimeLine.seek(newTime);


        this.editorElements.forEach(element => {
          if (element.type === 'text' && element.subType === 'subtitles') {
            const isInside =
              element.timeFrame.start <= newTime &&
              newTime <= element.timeFrame.end;

            if (element.fabricObject) {
              element.fabricObject.set('opacity', 0);
            }

            if (element.properties.wordObjects) {
              element.properties.wordObjects.forEach((wordObj, index) => {
                if (wordObj && element.properties.words?.[index]) {
                  const word = element.properties.words[index];
                  const wordIsInside =
                    isInside && word.start <= newTime && newTime <= word.end;
                  wordObj.set('visible', wordIsInside);
                }
              });
            }
          }
        });


        this.canvas?.requestRenderAll();


        this.updateVideoElements();
        this.updateAudioElements();


        if (wasPlaying) {
          setTimeout(() => {
            this.setPlaying(true);
          }, 100);
        }

        resolve();
      });
    });
  }

  updateFromRedux(reduxState) {
    if (!reduxState) return;


    const existingElementsMap = new Map(
      this.editorElements.map(el => [
        el.id,
        {
          fabricObject: el.fabricObject,
          properties: {
            ...el.properties,
            wordObjects: el.properties?.wordObjects,
            imageObject: el.properties?.imageObject,
          },
          initialState: el.initialState,
        },
      ])
    );


    runInAction(() => {
      this.isUndoRedoOperation = true;
      try {

        this.editorElements = reduxState.editorElements.map(newEl => {
          const existingData = existingElementsMap.get(newEl.id);
          if (existingData) {

            const isImageUrl = newEl && newEl.type === 'imageUrl';
            const prevSrc = existingData?.properties?.src || null;
            const nextSrc = newEl?.properties?.src || null;
            const imageSrcChanged = isImageUrl && prevSrc !== nextSrc;



            const fabricObject = imageSrcChanged
              ? null
              : existingData.fabricObject;

            return {
              ...newEl,
              fabricObject,
              properties: {
                ...newEl.properties,

                wordObjects: existingData.properties.wordObjects,
                imageObject: imageSrcChanged
                  ? null
                  : existingData.properties.imageObject,
              },
              initialState: existingData.initialState,
            };
          }
          return newEl;
        });


        this.animations = reduxState.animations || [];


        if (reduxState.maxTime && reduxState.maxTime > 0) {
          this.maxTime = reduxState.maxTime;
        } else {

          const lastElement = reduxState.editorElements
            ?.slice()
            ?.sort((a, b) => b.timeFrame.end - a.timeFrame.end)[0];

          if (lastElement) {
            const buffer = Math.max(30000, lastElement.timeFrame.end * 0.2);
            this.maxTime = lastElement.timeFrame.end + buffer;
          } else {
            this.maxTime = 30000
          }
        }

        this.backgroundColor = reduxState.backgroundColor || '';
        this.fps = reduxState.fps || 0;
        this.synchronise = reduxState.synchronise || false;


        const maxRowFromElements = this.editorElements.reduce(
          (max, element) => {
            return Math.max(max, element.row || 0);
          },
          0
        );
        this.maxRows = Math.max(1, maxRowFromElements + 1);


        requestAnimationFrame(() => {
          this.refreshElements();
          this.canvas?.requestRenderAll();
        });
      } finally {
        this.isUndoRedoOperation = false;
      }
    });
  }

  setIsResizing(value) {
    this.isResizing = value;
  }


  updateAspectRatio(aspectRatio) {

    const oldAspectRatio = this.currentAspectRatio
      ? { ...this.currentAspectRatio }
      : null;

    if (typeof aspectRatio === 'string') {
      const [width, height] = aspectRatio.split(':').map(Number);
      this.currentAspectRatio = { width, height };
    } else if (
      aspectRatio &&
      typeof aspectRatio === 'object' &&
      aspectRatio.width &&
      aspectRatio.height
    ) {
      this.currentAspectRatio = {
        width: aspectRatio.width,
        height: aspectRatio.height,
      };
    }


    if (this.canvas) {
      const newAspectRatio = this.getAspectRatioValue();
      const baseWidth = 1080;
      const newHeight = Math.round(baseWidth / newAspectRatio);


      let scaleFactorX = 1;
      let scaleFactorY = 1;

      if (
        oldAspectRatio &&
        (oldAspectRatio.width !== this.currentAspectRatio.width ||
          oldAspectRatio.height !== this.currentAspectRatio.height)
      ) {
        const oldAspectValue = oldAspectRatio.width / oldAspectRatio.height;
        const oldHeight = Math.round(baseWidth / oldAspectValue);

        scaleFactorX = baseWidth / baseWidth
        scaleFactorY = newHeight / oldHeight
      }


      const objectStates = this.canvas.getObjects().map(obj => {
        if (
          obj.type === 'image' ||
          obj.type === 'videoImage' ||
          obj.type === 'CoverVideo'
        ) {
          return {
            object: obj,
            originalWidth: obj.width,
            originalHeight: obj.height,
            currentScaleX: obj.scaleX,
            currentScaleY: obj.scaleY,
            currentLeft: obj.left,
            currentTop: obj.top,
          };
        }
        return { object: obj };
      });


      this.canvas.setWidth(baseWidth);
      this.canvas.setHeight(newHeight);


      if (oldAspectRatio && (scaleFactorX !== 1 || scaleFactorY !== 1)) {
        this.scaleElementPositions(scaleFactorX, scaleFactorY);
      }


      objectStates.forEach(state => {
        if (state.originalWidth && state.originalHeight) {
          const obj = state.object;


          const editorElement = this.editorElements.find(
            el => el.fabricObject === obj
          );
          const hasCustomPlacement =
            editorElement?.placement &&
            editorElement.placement.x !== undefined &&
            editorElement.placement.y !== undefined &&
            editorElement.subType !== 'placeholder';

          if (hasCustomPlacement) {

            const scaledLeft = state.currentLeft * scaleFactorX;
            const scaledTop = state.currentTop * scaleFactorY;


            const newScale = Math.min(
              baseWidth / state.originalWidth,
              newHeight / state.originalHeight
            );

            obj.set({
              scaleX: newScale,
              scaleY: newScale,
              left: scaledLeft,
              top: scaledTop,
            });
          } else {

            const newScale = Math.min(
              baseWidth / state.originalWidth,
              newHeight / state.originalHeight
            );

            const newLeft = (baseWidth - state.originalWidth * newScale) / 2;
            const newTop = (newHeight - state.originalHeight * newScale) / 2;

            obj.set({
              scaleX: newScale,
              scaleY: newScale,
              left: newLeft,
              top: newTop,
            });
          }

          obj.setCoords();


          if (editorElement) {
            editorElement.placement = {
              ...editorElement.placement,
              x: obj.left,
              y: obj.top,
              scaleX: obj.scaleX,
              scaleY: obj.scaleY,
              width: state.originalWidth * obj.scaleX,
              height: state.originalHeight * obj.scaleY,
            };
          }
        }
      });


      this.canvas.setDimensions(
        {
          width: `calc((100vh - 360px) * ${newAspectRatio})`,
          height: 'calc(100vh - 360px)',
        },
        {
          cssOnly: true,
        }
      );


      this.canvas.renderAll();
    }


    if (typeof window !== 'undefined' && window.updateCanvasSize) {
      requestAnimationFrame(() => {
        window.updateCanvasSize();
      });
    }
  }


  getAspectRatioValue() {
    return this.currentAspectRatio.width / this.currentAspectRatio.height;
  }


  scaleElementPositions(scaleFactorX, scaleFactorY) {
    if (!this.canvas) return;


    this.canvas.getObjects().forEach(obj => {
      if (
        obj.type === 'image' ||
        obj.type === 'videoImage' ||
        obj.type === 'CoverVideo' ||
        obj.type === 'text'
      ) {

        obj.set({
          left: obj.left * scaleFactorX,
          top: obj.top * scaleFactorY,
        });


        const editorElement = this.editorElements.find(
          el => el.fabricObject === obj
        );
        if (editorElement && editorElement.placement) {
          editorElement.placement.x = obj.left;
          editorElement.placement.y = obj.top;
        }
      }
    });


    this.canvas.requestRenderAll();
  }

  updateImageBackground = (elementId, backgroundColor, backgroundOpacity) => {
    const element = this.editorElements.find(el => el.id === elementId);
    if (!element || element.type !== 'imageUrl') return;


    element.properties.background = {
      color: backgroundColor,
      opacity: backgroundOpacity,
    };


    const elementAnimations = this.animations.filter(
      a => a.targetId === elementId
    );


    if (this.canvas) {
      const currentTime = this.currentTimeInMs;
      if (
        currentTime >= element.timeFrame.start &&
        currentTime <= element.timeFrame.end
      ) {


        if (elementAnimations.length === 0) {
          this.canvas.backgroundColor = backgroundColor;
          this.canvas.backgroundOpacity = backgroundOpacity;
          this.canvas.renderAll();
        } else {

          this.refreshAnimations();
        }
      }
    }
  };

  updateElementFrameFill = element => {
    if (!element || !element.properties?.frameFill || !this.canvas) return;


    this.updateCanvasFrameFill();
  };

  removeElementFrameFill = element => {
    if (!element || !this.canvas) return;


    this.updateCanvasFrameFill();
  };

  updateCanvasFrameFill = () => {
    if (!this.canvas) return;

    const currentTime = this.currentTimeInMs;


    const activeFrameFillElements = this.editorElements.filter(
      element =>
        element.properties?.frameFill &&
        element.properties.frameFill.type !== 'None' &&
        currentTime >= element.timeFrame.start &&
        currentTime <= element.timeFrame.end
    );


    let globalFrameFill = this.canvas
      .getObjects()
      .find(obj => obj.name === 'globalFrameFill');

    if (activeFrameFillElements.length > 0) {

      const priorityElement = activeFrameFillElements.sort((a, b) => {
        if (a.row !== b.row) {
          return b.row - a.row
        }
        return b.timeFrame.start - a.timeFrame.start
      })[0];

      const frameFill = priorityElement.properties.frameFill;

      if (!globalFrameFill) {

        globalFrameFill = new fabric.Rect({
          left: 0,
          top: 0,
          width: this.canvas.width,
          height: this.canvas.height,
          fill: frameFill.color,
          opacity: frameFill.opacity,
          selectable: false,
          evented: false,
          excludeFromExport: false,
          name: 'globalFrameFill',
          objectCaching: true,
        });

        this.canvas.add(globalFrameFill);
        globalFrameFill.sendToBack();
      } else {

        globalFrameFill.set({
          fill: frameFill.color,
          opacity: frameFill.opacity,
          visible: true,
        });
      }
    } else {

      if (globalFrameFill) {
        globalFrameFill.set({
          visible: false,
          opacity: 0,
        });
      }


      this.canvas.backgroundColor = this.backgroundColor;
      this.canvas.backgroundOpacity = 1;
    }
  };


  getRowGaps = rowIndex => {
    const elementsInRow = this.editorElements
      .filter(el => el.row === rowIndex)
      .sort((a, b) => a.timeFrame.start - b.timeFrame.start);

    const gaps = [];

    if (elementsInRow.length === 0) return gaps;


    if (elementsInRow[0].timeFrame.start > 0) {

      if (elementsInRow.length > 0) {
        gaps.push({
          start: 0,
          end: elementsInRow[0].timeFrame.start,
        });
      }
    }


    for (let i = 0; i < elementsInRow.length - 1; i++) {
      const currentEnd = elementsInRow[i].timeFrame.end;
      const nextStart = elementsInRow[i + 1].timeFrame.start;

      if (nextStart > currentEnd) {
        gaps.push({
          start: currentEnd,
          end: nextStart,
        });
      }
    }



    return gaps;
  };


  removeGap = action((gapStart, gapEnd, rowIndex) => {
    const gapDuration = gapEnd - gapStart;


    const elementsToShift = this.editorElements.filter(
      el => el.row === rowIndex && el.timeFrame.start >= gapEnd
    );


    elementsToShift.forEach(element => {
      this.moveEditorElementTimeFrame(
        element,
        {
          start: element.timeFrame.start - gapDuration,
          end: element.timeFrame.end - gapDuration,
        },
        true
      );
    });


    this.saveToHistory?.();


    setTimeout(() => {
      this.refreshElements?.();
    }, 0);

    if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
      window.dispatchSaveTimelineState(this);
    }
  });


  moveEditorElementTimeFrame = action((element, nextTimeFrame, skipRefresh = false) => {
    if (!element?.id || !nextTimeFrame) return;

    const idx = this.editorElements.findIndex(el => el.id === element.id);
    if (idx === -1) return;

    const safeStart = Math.max(0, Number(nextTimeFrame.start) || 0);
    const safeEnd = Math.max(safeStart + 1, Number(nextTimeFrame.end) || safeStart + 1);


    this.editorElements[idx] = {
      ...this.editorElements[idx],
      timeFrame: { start: safeStart, end: safeEnd },
    };


    if (safeEnd > this.maxTime) {
      this.maxTime = safeEnd;
    }

    if (!skipRefresh) {
      this.refreshElements?.();
    }

    if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
      window.dispatchSaveTimelineState(this);
    }
  });


  startResizeGhost = action((element, resizeType, initialClickOffset = 0) => {
    if (!element?.id) return;
    this.ghostState.isResizing = true;
    this.ghostState.resizeType = resizeType;
    this.ghostState.resizeTargetElement = element;
    this.ghostState.initialClickOffset = initialClickOffset || 0;
    this.ghostState.resizeGhostElement = {
      id: element.id,
      row: element.row,
      start: element.timeFrame.start,
      end: element.timeFrame.end,
      type: element.type,
    };
  });

  updateResizeGhost = action((start, end) => {
    if (!this.ghostState.isResizing || !this.ghostState.resizeGhostElement) return;
    const s = Math.max(0, Number(start) || 0);
    const e = Math.max(s + 1, Number(end) || s + 1);
    this.ghostState.resizeGhostElement = {
      ...this.ghostState.resizeGhostElement,
      start: s,
      end: e,
    };
  });

  finishResizeGhost = action((finalStart, finalEnd) => {
    if (!this.ghostState.isResizing) return;
    const target = this.ghostState.resizeTargetElement;
    if (target) {
      this.moveEditorElementTimeFrame(
        target,
        { start: finalStart, end: finalEnd },
        false
      );
      this.saveToHistory?.();
    }
    this.ghostState.isResizing = false;
    this.ghostState.resizeType = null;
    this.ghostState.resizeGhostElement = null;
    this.ghostState.resizeTargetElement = null;
    this.ghostState.initialClickOffset = 0;
  });


  updateGhostElementWithPush = action((newPosition, targetRow, isIncompatible, draggedElement) => {
    if (!this.ghostState.isDragging || !this.ghostState.draggedElement) return;


    this.ghostState.ghostMarkerPosition = newPosition;
    this.ghostState.isIncompatibleRow = isIncompatible;


    if (this.ghostState.ghostElement) {
      const elementDuration = draggedElement.timeFrame.end - draggedElement.timeFrame.start;
      this.ghostState.ghostElement = {
        ...this.ghostState.ghostElement,
        row: targetRow,
        start: newPosition,
        end: newPosition + elementDuration,
      };
    }


    if (this.ghostState.enablePushOnDrag && !isIncompatible) {
      const elementDuration = draggedElement.timeFrame.end - draggedElement.timeFrame.start;
      const ghostEnd = newPosition + elementDuration;
      

      const elementsInRow = this.editorElements.filter(
        el => el.row === targetRow && el.id !== draggedElement.id
      );


      this.ghostState.livePushOffsets.clear();


      elementsInRow.forEach(element => {

        if (newPosition < element.timeFrame.end && ghostEnd > element.timeFrame.start) {

          const overlapStart = Math.max(newPosition, element.timeFrame.start);
          const overlapEnd = Math.min(ghostEnd, element.timeFrame.end);
          const overlapDuration = overlapEnd - overlapStart;
          

          const pushOffset = elementDuration;
          this.ghostState.livePushOffsets.set(element.id, pushOffset);
        }
      });
    } else {

      this.ghostState.livePushOffsets.clear();
    }
  });


  updateAnimationGhostElementWithPush = action((newPosition, targetRow, isIncompatible, draggedElement) => {


    this.updateGhostElementWithPush(newPosition, targetRow, isIncompatible, draggedElement);
  });


  recalculateMaxRows = action(() => {

    this.optimizedCleanupEmptyRows();
  });


  startRowDrag = action(rowIndex => {
    this.ghostState.isDraggingRow = true;
    this.ghostState.draggedRowIndex = rowIndex;
    this.ghostState.dragOverRowIndex = null;
    this.ghostState.rowInsertPosition = null
  });

  updateRowDragOver = action((rowIndex, position = null) => {
    if (!this.ghostState.isDraggingRow) return;

    this.ghostState.dragOverRowIndex = rowIndex;
    this.ghostState.rowInsertPosition = position;
  });

  finishRowDrag = action(targetRowIndex => {
    if (
      !this.ghostState.isDraggingRow ||
      this.ghostState.draggedRowIndex === null
    ) {
      return;
    }

    const fromRowIndex = this.ghostState.draggedRowIndex;


    if (fromRowIndex === targetRowIndex) {
      this.ghostState.isDraggingRow = false;
      this.ghostState.draggedRowIndex = null;
      this.ghostState.dragOverRowIndex = null;
      return;
    }


    const allElements = [...this.editorElements];

    if (fromRowIndex < targetRowIndex) {

      allElements.forEach(element => {
        if (element.row === fromRowIndex) {
          element.row = targetRowIndex;
        } else if (
          element.row > fromRowIndex &&
          element.row <= targetRowIndex
        ) {
          element.row -= 1;
        }
      });
    } else {

      allElements.forEach(element => {
        if (element.row === fromRowIndex) {
          element.row = targetRowIndex;
        } else if (
          element.row >= targetRowIndex &&
          element.row < fromRowIndex
        ) {
          element.row += 1;
        }
      });
    }


    this.recalculateMaxRows();


    this.revalidateAllAnimationTargets();


    this.revalidateGLTransitions();


    this.ghostState.isDraggingRow = false;
    this.ghostState.draggedRowIndex = null;
    this.ghostState.dragOverRowIndex = null;
    this.ghostState.rowInsertPosition = null;


    this.refreshElements();


    if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
      window.dispatchSaveTimelineState(this);
    }
  });

  cancelRowDrag = action(() => {
    this.ghostState.isDraggingRow = false;
    this.ghostState.draggedRowIndex = null;
    this.ghostState.dragOverRowIndex = null;
    this.ghostState.rowInsertPosition = null;
  });


  deleteRow = action(rowIndex => {
    if (rowIndex == null || rowIndex < 0) return;


    this.editorElements = this.editorElements.filter(el => el.row !== rowIndex);


    this.editorElements.forEach(el => {
      if (el.row > rowIndex) {
        el.row -= 1;
      }
    });


    this.recalculateMaxRows();


    this.ghostState.isDraggingRow = false;
    this.ghostState.draggedRowIndex = null;
    this.ghostState.dragOverRowIndex = null;

    this.refreshElements?.();
  });


  startGhostDrag = action((element, initialClickOffset, initialClientX, dragType) => {
    if (!element) return;
    
    this.ghostState.isDragging = true;
    this.ghostState.draggedElement = element;
    this.ghostState.ghostElement = {
      id: element.id,
      row: element.row,
      start: element.timeFrame.start,
      end: element.timeFrame.end,
      type: element.type,
    };
    this.ghostState.ghostMarkerPosition = element.timeFrame.start;
    this.ghostState.initialClickOffset = initialClickOffset || 0;
    this.ghostState.initialClientX = initialClientX || null;
    this.ghostState.initialElementStart = element.timeFrame.start;
  });


  startFileGhostDrag = action((fileItem, elementType = 'imageUrl', defaultDuration = 5000) => {
    this.ghostState.isFileDragging = true;
    this.ghostState.fileData = { fileItem, elementType, defaultDuration };
    this.ghostState.fileGhostElement = {
      type: elementType,
      row: 0,
      start: 0,
      end: defaultDuration,
    };
  });

  finishFileGhostDrag = action((finalPosition, targetRow, onDropCb) => {
    if (!this.ghostState.isFileDragging || !this.ghostState.fileGhostElement) return;
    const duration =
      (this.ghostState.fileGhostElement.end - this.ghostState.fileGhostElement.start) || 0;
    const startTime = Math.max(0, Number(finalPosition) || 0);
    const clampedStart = Math.max(0, Math.min(this.maxTime, startTime));


    if (typeof onDropCb === 'function') {
      onDropCb(clampedStart, targetRow);
    }


    this.ghostState.isFileDragging = false;
    this.ghostState.fileGhostElement = null;
    this.ghostState.fileData = null;
  });


  startMultiGhostDrag = action((selectedElements, draggedElement, initialClickOffset = 0) => {
    const els = (selectedElements || []).filter(Boolean);
    if (!els.length || !draggedElement) return;
    this.ghostState.isMultiDragging = true;
    this.ghostState.selectedElements = els;
    this.ghostState.initialElementStarts = els.map(el => el.timeFrame?.start ?? 0);
    this.ghostState.draggedElement = draggedElement;
    this.ghostState.initialClickOffset = initialClickOffset || 0;
    this.ghostState.initialElementStart = draggedElement.timeFrame?.start ?? 0;
    this.ghostState.multiGhostElements = els.map(el => ({
      id: el.id,
      row: el.row,
      start: el.timeFrame.start,
      end: el.timeFrame.end,
      type: el.type,
    }));
  });

  updateMultiGhostElements = action(newStartForDragged => {
    if (!this.ghostState.isMultiDragging || !this.ghostState.selectedElements?.length) return;
    const draggedStart0 = this.ghostState.initialElementStart || 0;
    const delta = (Number(newStartForDragged) || 0) - draggedStart0;
    this.ghostState.multiGhostElements = this.ghostState.selectedElements.map((el, idx) => {
      const start0 = this.ghostState.initialElementStarts[idx] || 0;
      const dur = el.timeFrame.end - el.timeFrame.start;
      const start = Math.max(0, start0 + delta);
      return { id: el.id, row: el.row, start, end: start + dur, type: el.type };
    });
  });

  finishMultiGhostDrag = action(finalPosition => {
    if (!this.ghostState.isMultiDragging || !this.ghostState.selectedElements?.length) return;
    const draggedStart0 = this.ghostState.initialElementStart || 0;
    const delta = (Number(finalPosition) || 0) - draggedStart0;
    this.ghostState.selectedElements.forEach((el, idx) => {
      const start0 = this.ghostState.initialElementStarts[idx] || 0;
      const dur = el.timeFrame.end - el.timeFrame.start;
      const start = Math.max(0, start0 + delta);
      this.moveEditorElementTimeFrame(el, { start, end: start + dur }, true);
    });

    const rows = new Set(this.ghostState.selectedElements.map(e => e.row));
    rows.forEach(r => this.compactRowTimeFrames(r));
    this.refreshElements?.();
    this.saveToHistory?.();
    this.resetGhostState();
  });



  compactRowTimeFrames = action(rowIndex => {
    if (rowIndex == null) return;
    const rowNum = Number(rowIndex);
    if (!Number.isFinite(rowNum)) return;
    const rowElements = this.editorElements
      .filter(el => Number(el.row) === rowNum)
      .slice()
      .sort((a, b) => a.timeFrame.start - b.timeFrame.start);

    if (rowElements.length <= 1) return;

    const anchorStart = Math.max(
      0,
      rowElements.reduce((min, el) => Math.min(min, el.timeFrame.start), rowElements[0].timeFrame.start)
    );

    let cursor = anchorStart;
    for (const el of rowElements) {
      const dur = Math.max(1, el.timeFrame.end - el.timeFrame.start);
      this.moveEditorElementTimeFrame(el, { start: cursor, end: cursor + dur }, true);
      cursor += dur;
    }
  });


  finishGhostDrag = action((finalPosition, targetRow) => {
    if (!this.ghostState.isDragging || !this.ghostState.draggedElement) return;
    const dragged = this.ghostState.draggedElement;
    const originalRow = dragged.row;
    const dur = dragged.timeFrame.end - dragged.timeFrame.start;
    const newStart = Math.max(0, Number(finalPosition) || 0);
    const newEnd = newStart + dur;

    const row = Number.isFinite(targetRow) ? targetRow : dragged.row;

    const candidates = this.editorElements.filter(
      el => el.row === row && el.id !== dragged.id
    );

    let best = null;
    let bestOverlap = 0;
    for (const el of candidates) {
      const overlap = Math.min(newEnd, el.timeFrame.end) - Math.max(newStart, el.timeFrame.start);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = el;
      }
    }

    if (best && bestOverlap > 0) {

      const draggedOld = { ...dragged.timeFrame };
      const bestOld = { ...best.timeFrame };


      const bestDur = bestOld.end - bestOld.start;
      const draggedDur = draggedOld.end - draggedOld.start;

      const newDraggedStart = bestOld.start;
      const newBestStart = draggedOld.start;

      this.moveEditorElementTimeFrame(
        dragged,
        { start: newDraggedStart, end: newDraggedStart + draggedDur },
        true
      );
      this.moveEditorElementTimeFrame(
        best,
        { start: newBestStart, end: newBestStart + bestDur },
        true
      );


      const draggedIdx = this.editorElements.findIndex(e => e.id === dragged.id);
      if (draggedIdx !== -1) {
        this.editorElements[draggedIdx] = { ...this.editorElements[draggedIdx], row };
      }
    } else {

      this.moveEditorElementTimeFrame(dragged, { start: newStart, end: newEnd }, true);
      const draggedIdx = this.editorElements.findIndex(e => e.id === dragged.id);
      if (draggedIdx !== -1) {
        this.editorElements[draggedIdx] = { ...this.editorElements[draggedIdx], row };
      }
    }


    const rowsToCompact = new Set([row, originalRow]);
    if (best) rowsToCompact.add(best.row);
    rowsToCompact.forEach(r => this.compactRowTimeFrames(r));

    this.refreshElements?.();
    this.saveToHistory?.();
    if (window.dispatchSaveTimelineState && !this.isUndoRedoOperation) {
      window.dispatchSaveTimelineState(this);
    }
    this.resetGhostState();
  });


  resetGhostState = action(() => {
    this.ghostState.isDragging = false;
    this.ghostState.ghostElement = null;
    this.ghostState.ghostMarkerPosition = null;
    this.ghostState.draggedElement = null;
    this.ghostState.alignmentLines = [];
    this.ghostState.isIncompatibleRow = false;
    this.ghostState.initialClickOffset = 0;
    this.ghostState.initialClientX = null;
    this.ghostState.initialElementStart = 0;
    this.ghostState.isMultiDragging = false;
    this.ghostState.multiGhostElements = [];
    this.ghostState.selectedElements = [];
    this.ghostState.initialElementStarts = [];
    this.ghostState.livePushOffsets?.clear?.();
    this.ghostState.isFileDragging = false;
    this.ghostState.fileGhostElement = null;
    this.ghostState.fileData = null;
  });
}

export function isEditorAudioElement(element) {
  return element.type === 'audio';
}

export function isEditorVideoElement(element) {
  return element.type === 'video';
}

export function isEditorImageElement(element) {
  return element.type === 'image' || element.type === 'imageUrl';
}

export function isEditorVisualElement(element) {
  return isEditorImageElement(element) || isEditorVideoElement(element);
}

export function canHaveAnimations(element) {
  return isEditorVisualElement(element);
}

export function canHaveTransitions(element) {
  return isEditorVisualElement(element);
}
