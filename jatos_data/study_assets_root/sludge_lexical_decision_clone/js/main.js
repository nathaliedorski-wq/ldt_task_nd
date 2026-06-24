/* =========================================================================
   Lexical Decision Task — main.js
   Requires: jsPsych v8, @jspsych/plugin-html-keyboard-response, @jspych/chinrest-plugin
             @jspsych/plugin-preload, @jspsych/psychophysics-plugin, PapaParse, (optional) jatos.js
   ========================================================================= */

/* ---------------------------------------------------------------------------
   Step 1 — Initialise jsPsych + add global variable to store physical scaling 
   ------------------------------------------------------------------------- */
let px2deg = 0;
const jsPsych = initJsPsych({
  display_element: 'jspsych-target',
  use_webaudio: true,
  case_sensitive_responses: false,
  maximize_window: false,
  canvas_id: 'shared-canvas',
  on_finish: function () {
    if (typeof jatos !== "undefined") {
      // Only get data where is_practice is NOT true
      const realData = jsPsych.data.get().filter({ is_practice: false }).csv();
      jatos.submitResultData(realData, jatos.startNextComponent);
    } else {
      console.log("Experiment finished. Real Data:");
      console.log(jsPsych.data.get().filter({ is_practice: false }).csv());
    }
  },
});

/* Helper function for GPU cleaning */

function cleanupCanvases() {

}

let _dispatching = false;


document.addEventListener('keydown', function (e) {
  if (_dispatching) return;
  const key = e.key.toLowerCase();
  if (key === keyMap.word || key === keyMap.nonword) {
    const canvas = document.querySelector('#jspsych-target canvas');
    if (canvas) {
      canvas.tabIndex = 0;
      canvas.focus({ preventScroll: true });
    }
  }
});

/*----------------------------------------------------------------
   Step 2 — Automatic Group Assignment (8 Groups)
   ------------------------------------------------------------------------- */
const group = (function () {
  if (typeof jatos !== "undefined") {
    const id = parseInt(jatos.workerId, 10);
    return isNaN(id) ? 0 : id % 8;
  }
  return Math.floor(Math.random() * 8);

  }());


  // TEMPORARY TEST — forces group 4 (Visual first)
  //const group = 4;

  // 0-3 start with Audio, 4-7 start with Visual
  const startModality = group < 4 ? "Audio" : "Visual";
  const otherModality = group < 4 ? "Visual" : "Audio";

  // Key assignment rotation (Z/M)
  const keyAssign = group % 2;
  const keyMap = {
    word: keyAssign === 0 ? "m" : "z",
    nonword: keyAssign === 0 ? "z" : "m",
  };

  const audioDurations = {};

  function preloadAudioDurations(items) {
    const promises = items
      .filter(item => item.AudioFile && item.Modality === "Audio")
      .map(item => {
        return new Promise(resolve => {
          const audio = new Audio(item.AudioFile);
          audio.addEventListener('loadedmetadata', function () {
            audioDurations[item.AudioFile] = Math.ceil(audio.duration * 1000);
            resolve();
          });
          audio.addEventListener('error', function () {
            audioDurations[item.AudioFile] = 800;
            resolve();
          });
        });
      });
    return Promise.all(promises);
  }

  // Step 3 — Condition & Video Order 

  //frozenFirst controls block order WITHIN each video pair:
  //  true  → Frozen then Video  (groups 0,1,4,5)
  //  false → Video then Frozen  (groups 2,3,6,7)

  //Each modality phase has 4 blocks built from two video pairs (A then B):
  //  Pair A: [pairOrder[0] with videoA,  pairOrder[1] with videoA]
  // Pair B: [pairOrder[0] with videoB,  pairOrder[1] with videoB]

  //"Frozen" for a given pair always uses a frame from THAT pair's video,
  //so participants never see a frozen frame from a video they haven't
  // been assigned to yet.
  // ------------------------------------------------------------------------- *//

  const frozenFirst = (Math.floor(group / 2) % 2) === 0;
  const pairOrder = frozenFirst ? ["Frozen", "Video"] : ["Video", "Frozen"];

  // The four blocks per modality phase, in order:
  // [{condition, videoFile}, {condition, videoFile}, {condition, videoFile}, {condition, videoFile}]
  const phaseBlocks = [
    { condition: pairOrder[0], videoFile: "stimuli/videoA.mp4" },
    { condition: pairOrder[1], videoFile: "stimuli/videoA.mp4" },
    { condition: pairOrder[0], videoFile: "stimuli/videoB.mp4" },
    { condition: pairOrder[1], videoFile: "stimuli/videoB.mp4" },
  ];

  // Stimulus keys used in the CSV — one pool of 25 items per key
  // Key format:  "<Modality>_<Condition>_<VideoLetter>"
  // e.g. "Audio_Frozen_A", "Audio_Video_A", "Visual_Frozen_B", etc.
  // Your loadStimuli function must map CSV rows to these keys (see Step 6 note below).

  console.log("Group:", group,
    "| Start:", startModality,
    "| Keys: word=", keyMap.word, "nonword=", keyMap.nonword,
    "| Order:", pairOrder[0], "→", pairOrder[1]);

  /* -------------------------------------------------------------------------
     Step 4 — Welcome scrren and Virtual Chinrest Definition
     ------------------------------------------------------------------------- */
const welcome_screen = {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: `
    <div class="intro-view">
      <h1>Welcome to our experiment!</h1>
      <p>Thank you so much for your participation!</p>
      <p>In this task, you will decide if the word you hear or see exists in the English Language.</p>
      <p>In the next step, we will calibrate your screen settings to ensure accuracy.</p>
      <p><strong>Press any key to begin.</strong></p>
    </div>
  `
};

const chinrest = {
  type: jsPsychVirtualChinrest,
  blindspot_reps: 3,
  resize_units: "none",
  pixels_per_unit: 100,
  on_start: function() {
    window.focus();
    if (document.body) document.body.focus();
    const style = document.createElement('style');
    style.id = 'chinrest-white-bg';
    style.innerHTML = `
      body, .jspsych-display-element, #jspsych-target, .jspsych-content-wrapper {
        background: white !important;
        background-image: none !important;
        filter: none !important;
        backdrop-filter: none !important;
      }
      video, .background-video, iframe {
        display: none !important;
      }
      .jspsych-content, .jspsych-content p, .jspsych-content li, .jspsych-content span {
        color: black !important;
        font-weight: normal !important;
        text-shadow: none !important;
        -webkit-filter: none !important;
      }
      .jspsych-content p, .jspsych-content li {
        margin-bottom: 20px !important;
      }
      .jspsych-content-wrapper {
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
      }
      .jspsych-content {
        text-align: center !important;
        font-size: 1.3em !important;
        line-height: 2.2 !important;
        max-width: 900px !important;
        width: 90vw !important;
        margin: 0 auto !important;
      }
`;
    document.head.appendChild(style);
  },
  on_finish: function(data) {
    const style = document.getElementById('chinrest-white-bg');
    if (style) style.remove();
    px2deg = data.px2deg;
    console.log("Measured px2deg:", px2deg);
  }
};
  const goodbye_screen = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `
    <div class="intro-view">
      <h1>Thank you for participating!</h1>
      <p>The experiment is now complete.</p>
      <p>You will be redirected back to Prolific in a few seconds.</p>
      <p><strong>Please do not close this window.</strong></p>
    </div>
  `,
    choices: "NO_KEYS",
    trial_duration: 3000,
    on_finish: function () {
      window.location = "https://app.prolific.com/submissions/complete?cc=C1CUGJ7R";
    }
  };

  /* -------------------------------------------------------------------------
     Step 6 — STIMULUS LOADER
   
     CSV stimulus_list column must now use the format:
       "<Modality>_<Condition>_<VideoLetter>"   e.g. "Audio_Frozen_A"
     with VideoLetter = A or B indicating which video pair this item belongs to.
   
     Practice rows still use "practice" as before.
     ------------------------------------------------------------------------- */
  function loadStimuli(url) {
    console.log("loadStimuli:", url);
    return new Promise(function (resolve, reject) {
      Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        delimiter: ";",
        complete: function (results) {
          const blockMap = {};
          try {
            results.data.forEach(function (row) {
              const rawKey = (row["stimulus_list"] || "").toString().trim();
              const ItemID = (row["ItemID"] || "").trim();
              const target = (row["Target"] || "").trim();
              const stimType = (row["StimulusType"] || "").trim();

              // Parse the stimulus_list key into its three parts
              // Expected format: "Audio_Frozen_A" / "Visual_Video_B" / "practice"
              let key, modality, condition, videoLetter;

             if (rawKey === "practice" || url.includes("practice")) {
                key = "practice";
                modality = startModality;
                condition = "Video";   // assigned at runtime
                videoLetter = "A";
              } else {
                // New format: stimulus_list is just the modality ("Audio" or "Visual")
                modality = rawKey;     // "Audio" | "Visual"
                condition = null;      // assigned at runtime in runExperiment
                videoLetter = null;    // assigned at runtime in runExperiment
                key = rawKey;          // "Audio" | "Visual"
                if (modality !== "Audio" && modality !== "Visual") {
                  throw new Error(`stimulus_list value "${rawKey}" must be "Audio" or "Visual". Got "${rawKey}".`);
                }
              }

              if (!blockMap[key]) blockMap[key] = [];

              let corrAns;
              if (stimType === "WORD") corrAns = keyMap.word;
              else if (stimType === "NONWORD") corrAns = keyMap.nonword;
              else throw new Error(
                `Unknown StimulusType "${stimType}" for Target "${target}" (ItemID: ${ItemID}). ` +
                `Expected "WORD" or "NONWORD".`
              );

              blockMap[key].push({
                Target: target,
                DisplayTarget: row["DisplayTarget"],
                StimulusType: stimType,
                WordFrequency: row["WordFrequency"],
                corr_ans: corrAns,
                stimulus_list: key,
                stimulus_list_csv: rawKey,
                ItemID: ItemID,
                Modality: modality,
                Condition: condition,
                VideoLetter: videoLetter,
                AudioFile: "stimuli/audio/" + ItemID + ".wav",
                stimulus: target,
              });
            });

            // Shuffle each block
            Object.keys(blockMap).forEach(function (k) {
              const arr = blockMap[k];
              for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
              }
            });

            resolve(blockMap);
          } catch (err) {
            reject(err);
          }
        },
        error: function (err) { reject(err); },
      });
    });
  }

  /* -------------------------------------------------------------------------
     Step 7 — Trial definitions
     ------------------------------------------------------------------------- */
  const instructions = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function () {
      const action = startModality === "Audio" ? "HEAR words" : "SEE words";

      return `
    <div class="instr-view">
      <h1>Experiment Instructions</h1>
      
      <div class="instr-accent-box">
        <strong>Phase 1:</strong> You will start with <strong>${startModality.toUpperCase()}</strong> trials. 
        In this part, you will ${action}.
      </div>

      <p>Is the item a real English word or a not?</p>

      <div class="key-row">
        <div class="key-card">
          <span class="key-val nonword-color">${keyMap.nonword.toUpperCase()}</span>
          <span class="key-label">Non Word</span>
        </div>
        <div class="key-card">
          <span class="key-val word-color">${keyMap.word.toUpperCase()}</span>
          <span class="key-label">Real Word</span>
        </div>
      </div>

      <p>Please respond as <strong>quickly</strong> and <strong>accurately</strong> as possible.</p>
      <p class="prompt-footer">Press any key to begin the practice block.</p>
    </div>
  `;
    }
  };

  const customFillerText = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `
    <div class="intro-view">
      <h1>Information</h1>
      <p>Before starting, we need to calibrate by measuring your distance to your screen.</p>
      <p>Please make sure you are in a comfortable position and won't need to move too much during the experiment.</p>
      <p class="prompt-footer">Press any key to continue.</p>
    </div>
  `,
    choices: "ALL_KEYS"
};

  let currentTrialCorrect = null;
  let errorCountInBlock = 0;
  let currentTarget = "";

  function makeVideoGate(condition, videoFile) {
  return {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: `
      <div class="instr-view">
        <h2>Loading…</h2>
        <p>Please wait a moment.</p>
      </div>`,
    choices: "NO_KEYS",
    trial_duration: null,       // no auto-advance; we end it manually when ready
    on_load: function () {
      const video = document.getElementById("distractor-video");
      const finish = function () {
        // apply the condition now that it's loaded, then advance
        applyCondition(video, condition);
        jsPsych.finishTrial();
      };

      if (!video) { finish(); return; }

      // Point the video at the right file
      if (video.getAttribute("src") !== videoFile) {
        video.src = videoFile;
        video.load();
      }

      // Wait until it can actually play
      if (video.readyState >= 3) {
        finish();
      } else {
        const onReady = function () {
          video.removeEventListener('canplaythrough', onReady);
          finish();
        };
        video.addEventListener('canplaythrough', onReady);

        // Safety: if it genuinely can't load after 10s, advance anyway
        // (so a participant isn't stuck forever) — or change to show an error.
        setTimeout(function () {
          video.removeEventListener('canplaythrough', onReady);
          finish();
        }, 10000);
      }
    }
  };
}

  function makeFixationTrial() {
    return {
      type: jsPsychPsychophysics,
      canvas_width: 1000,
      canvas_height: 600,
      background_color: 'rgba(0,0,0,0)',
      clear_canvas: true,
      stimuli: [{
        obj_type: 'text',
        content: '+',
        font: "40px Arial",
        text_color: 'white',
        startX: 'center',
        startY: 'center'
      }],
      choices: "NO_KEYS",
      trial_duration: 800,
      on_finish: function () {
        cleanupCanvases();
      }
    };
  }

  function makeLdtTrial(isPractice) {
    return {
      type: jsPsychPsychophysics,
      canvas_width: 1000,
      canvas_height: 600,
      background_color: 'rgba(0,0,0,0)',
      clear_canvas: true,
      response_ends_trial: true,
      response_start_time: 0,
      trial_duration: 2000,
      choices: [keyMap.word, keyMap.nonword],

      stimuli: [
        {
          obj_type: 'text',
          content: '',
          font: function () { return Math.round(px2deg * 1.2) + "px 'Courier New'"; },
          text_color: '#000000',
          startX: 'center',
          startY: 'center',
          show_start_time: 0
        },

        {
          obj_type: 'rect',
          width: function () { return Math.round(px2deg * 8); },   // 8 degrees wide
          height: function () { return Math.round(px2deg * 2); },  // 2 degrees tall
          fill_color: 'white',
          startX: 'center',
          startY: 'center',
          show_start_time: 0
        },

        {
          obj_type: 'sound',
          file: '',
          show_start_time: 0
        }
      ],

      on_start: function (trial) {
        const mod = jsPsych.evaluateTimelineVariable("Modality");
        const target = jsPsych.evaluateTimelineVariable("DisplayTarget") || jsPsych.evaluateTimelineVariable("Target");
        const audioPath = jsPsych.evaluateTimelineVariable("AudioFile");

        if (mod === "Visual") {
          trial.stimuli[0].content = target;
          trial.stimuli = [trial.stimuli[1], trial.stimuli[0]]; // rect first, text on top      
        } else {
          trial.stimuli[2].file = audioPath;
          trial.stimuli = [trial.stimuli[2]];
        
        const audioMs = audioDurations[audioPath] || 850;   
        const responseWindow = 900;                        
        trial.trial_duration = audioMs + responseWindow;
        trial.response_ends_trial = false;
        trial.response_start_time = 100;
        console.log(`[LDT start] mod=${mod} target=${target} audioPath=${audioPath} audioMs=${audioMs} → trial_duration=${trial.trial_duration}`);

        }

        trial._t0 = performance.now();

        [10, 50, 100, 200].forEach(delay => {
          setTimeout(() => {
            const canvas = document.querySelector('#jspsych-target canvas');
            if (canvas) { canvas.tabIndex = 0; canvas.focus({ preventScroll: true }); }
          }, delay);
        });
      },

      data: function () {
        return {
          Target: jsPsych.timelineVariable("Target"),
          StimulusType: jsPsych.timelineVariable("StimulusType"),
          WordFrequency: jsPsych.timelineVariable("WordFrequency"),
          corr_ans: jsPsych.timelineVariable("corr_ans"),
          stimulus_list: jsPsych.timelineVariable("stimulus_list"),
          stimulus_list_csv: jsPsych.timelineVariable("stimulus_list_csv"),
          ItemID: jsPsych.timelineVariable("ItemID"),
          Condition: jsPsych.timelineVariable("Condition"),
          Modality: jsPsych.timelineVariable("Modality"),
          VideoLetter: jsPsych.timelineVariable("VideoLetter"),
          group: group,
          keyAssign: keyAssign,
          frozenFirst: frozenFirst,
          wordKey: keyMap.word,
          nonwordKey: keyMap.nonword,
          measured_px2deg: px2deg,
          is_practice: isPractice || false
        };
      },

      on_finish: function (data) {
        data.correct = data.response === null ? -1 : (data.response === data.corr_ans ? 1 : 0);
        currentTrialCorrect = data.correct;
        // rt is measured from audio onset (response_start_time offset is handled by jsPsych)
        data.rt_from_onset = data.rt;
        // flag responses that landed before the audio finished (for your analysis/exclusions)
        const audioMs = data.Modality === "Audio" ? (audioDurations[data.AudioFile] || 850) : null;
        data.responded_before_audio_end = (audioMs !== null && data.rt !== null) ? (data.rt < audioMs) : null;
        if (data.correct === 0) errorCountInBlock++;
        else if (data.correct === 1) errorCountInBlock = 0;
        cleanupCanvases();
      }
    };
  }

  function makeTimeoutFeedback() {
    return {
      timeline: [{
        type: jsPsychPsychophysics,
        canvas_width: 1000,
        canvas_height: 600,
        background_color: 'rgba(0,0,0,0)',
        clear_canvas: true,
        stimuli: [
          {
            obj_type: 'text',
            content: "Too slow!",
            font: "bold 40px Arial",
            text_color: 'red',
            startX: 'center',
            startY: 'center'
          },
          {
            obj_type: 'text',
            content: function () {
              return `${keyMap.word.toUpperCase()} = Word    ${keyMap.nonword.toUpperCase()} = Non-word`;
            },
            font: "20px Arial",
            text_color: '#cccccc',
            startX: 'center',
            startY: 450
          }
        ],
        choices: "NO_KEYS",
        trial_duration: 1000,
        on_finish: function () {
          cleanupCanvases();
          [10, 50, 100].forEach(delay => {
            setTimeout(() => {
              const canvas = document.querySelector('#jspsych-target canvas');
              if (canvas) { canvas.tabIndex = 0; canvas.focus({ preventScroll: true }); }
            }, delay);
          });
        }
      }],
      conditional_function: function () {
        return currentTrialCorrect === -1;
      }
    };
  }

  function makeCorrectnessFeedback() {
    return {
      timeline: [{
        type: jsPsychPsychophysics,
        canvas_width: 1000,
        canvas_height: 600,
        background_color: 'rgba(0,0,0,0)',
        clear_canvas: true,
        stimuli: [
          {
            obj_type: 'text',
            content: '',
            font: function () { return Math.round(3 * px2deg) + "px Arial"; },
            text_color: 'white',
            startX: 'center',
            startY: 'center'
          },
          {
            obj_type: 'text',
            content: '',
            font: "22px Arial",
            text_color: '#bbbbbb',
            startX: 'center',
            startY: 450
          }
        ],
        on_start: function (trial) {
          const isCorrect = currentTrialCorrect === 1;
          trial.stimuli[0].content = isCorrect ? "✓" : "✗";
          trial.stimuli[0].text_color = isCorrect ? "#00FF00" : "#FF0000";
          trial.stimuli[1].content = (currentTrialCorrect === 0)
            ? `${keyMap.nonword.toUpperCase()} = Non-word    ${keyMap.word.toUpperCase()} = Word`
            : "";
        },
        choices: "NO_KEYS",
        trial_duration: function () {
          return currentTrialCorrect === 1 ? 600 : 800;
        },
        on_finish: function () {
          cleanupCanvases();
          currentTrialCorrect = null;
          [10, 50, 100].forEach(delay => {
            setTimeout(() => {
              const canvas = document.querySelector('#jspsych-target canvas');
              if (canvas) { canvas.tabIndex = 0; canvas.focus({ preventScroll: true }); }
            }, delay);
          });
        }
      }],
      conditional_function: function () {
        return currentTrialCorrect !== -1 && currentTrialCorrect !== null;
      }
    };
  }
  /* -------------------------------------------------------------------------
     Step 10 — Break screen between blocks
     ------------------------------------------------------------------------- */
  const blockBreak = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function () {
      return `
      <div class="instr-view">
        <h2 style="margin-bottom: 40px;">Break</h2>
        <p style="margin-bottom: 25px;">You have finished a block. Take a short break if you need to.</p>
        <p>Press any key to continue, or wait <span id="break-countdown">30</span> seconds.</p>
      </div>
    `;
    },
    choices: "ALL_KEYS",
    trial_duration: 30000,
    on_load: function () {
      let t = 29;
      const interval = setInterval(() => {
        const el = document.getElementById('break-countdown');
        if (el) { el.textContent = t; t--; }
        else clearInterval(interval);
      }, 1000);
    }
  };

  /* -------------------------------------------------------------------------
     Step 10b — Video condition helper
     FIX: now accepts a videoSrc parameter so the correct video file is applied
     ------------------------------------------------------------------------- */
 function applyVideoCondition(condition, videoSrc) {
    return new Promise(function (resolve) {
      const video = document.getElementById("distractor-video");
      if (!video) { resolve(true); return; }

      const proceed = function () {
        applyCondition(video, condition);
        resolve(true);
      };

      const needsNewSrc = videoSrc && video.getAttribute("src") !== videoSrc;
      if (needsNewSrc) {
        video.src = videoSrc;
        video.load();
      }

      // Already buffered enough? go now (handles the "event already fired" case)
      if (video.readyState >= 4) {            // HAVE_ENOUGH_DATA
        proceed();
        return;
      }

      const onReady = function () {
        cleanup();
        proceed();
      };
      const cleanup = function () {
        video.removeEventListener('canplaythrough', onReady);
      };
      video.addEventListener('canplaythrough', onReady);

      // If same src and it just needs a nudge, force a load
      if (!needsNewSrc && video.readyState < 4) {
        video.load();
      }
    });
  }

  function applyCondition(video, condition) {
    if (!video) return;
    if (condition === "Video") {
      video.style.filter = "";
      video.currentTime = 0;
      const p = video.play();
      if (p && p.catch) p.catch(function () {/* autoplay nudge */});
    } else if (condition === "Frozen") {
      video.style.filter = "";
      video.currentTime = 5.0;
      video.pause();
    }
  }
  
  /* -------------------------------------------------------------------------
     Step 11 — Assemble timeline and run
     ------------------------------------------------------------------------- */
  function runExperiment(practiceMap, mainMap, audioList) {

    const timeline = [
      welcome_screen,
      customFillerText,
      chinrest,
      instructions,
      {
        type: jsPsychHtmlKeyboardResponse,
        stimulus: '<div style="background: rgba(0,0,0,0.8); padding: 20px; border-radius: 10px;">' +
          '<p>The following trials will be practice trials.</p>' +
          '<p>Press any key to begin.</p></div>'
      }
    ];

    timeline.unshift({
      type: jsPsychPreload,
      audio: audioList,
      video: ['stimuli/videoA.mp4', 'stimuli/videoB.mp4'],
      message: "Loading experiment assets...",
      error_message: "Some assets failed to load. Please check your internet connection and try again.",
      continue_after_error: false,  // ← stops the experiment if preload fails
      on_error: function(file) {
        console.error("Failed to preload:", file);
      }
        });

    /* --- PRACTICE PHASE (reusable) --- */
    function buildPractice(practiceModality, requirePass) {
      // same practice words, presented in the given modality
      const practiceItems = (practiceMap["practice"] || []).map(item => ({
        ...item,
        Modality: practiceModality,
        Condition: "Video",
        VideoLetter: "A"
      }));

      let practiceCorrect = 0;

      const practiceBlock = {
        timeline: [
          makeFixationTrial(),
          {
            ...makeLdtTrial(),
            data: function () {
              return {
                Target: jsPsych.timelineVariable("Target"),
                StimulusType: jsPsych.timelineVariable("StimulusType"),
                WordFrequency: jsPsych.timelineVariable("WordFrequency"),
                corr_ans: jsPsych.timelineVariable("corr_ans"),
                stimulus_list: jsPsych.timelineVariable("stimulus_list"),
                stimulus_list_csv: jsPsych.timelineVariable("stimulus_list_csv"),
                ItemID: jsPsych.timelineVariable("ItemID"),
                Modality: jsPsych.timelineVariable("Modality"),
                Condition: jsPsych.timelineVariable("Condition"),
                VideoLetter: jsPsych.timelineVariable("VideoLetter"),
                group: group,
                keyAssign: keyAssign,
                frozenFirst: frozenFirst,
                wordKey: keyMap.word,
                nonwordKey: keyMap.nonword,
                measured_px2deg: px2deg,
                is_practice: true
              };
            },
            on_finish: function (data) {
              if (data.response === null) { data.correct = -1; }
              else { data.correct = data.response === data.corr_ans ? 1 : 0; }
              currentTrialCorrect = data.correct;
              if (data.correct === 1) practiceCorrect++;
            }
          },
          makeTimeoutFeedback(),
          makeCorrectnessFeedback()
        ],
        timeline_variables: practiceItems,
        randomize_order: true,
        on_timeline_start: function () {
          practiceCorrect = 0;   // reset each attempt
          applyVideoCondition("Video", "stimuli/videoA.mp4");
          errorCountInBlock = 0;
        }
      };

      const practiceWrapper = {
        timeline: [
          {
            type: jsPsychHtmlKeyboardResponse,
            stimulus: function () {
              return `
                <div class="instr-view">
                  <h2 style="color: #FFD700;">Practice</h2>
                  <p>You will practice with <strong>${practiceModality.toUpperCase()}</strong> trials.</p>
                  <div class="key-row">
                    <div class="key-card">
                      <span class="key-val nonword-color">${keyMap.nonword.toUpperCase()}</span>
                      <span class="key-label">Non-Word</span>
                    </div>
                    <div class="key-card">
                      <span class="key-val word-color">${keyMap.word.toUpperCase()}</span>
                      <span class="key-label">Word</span>
                    </div>
                  </div>
                  <p class="prompt-footer">Press any key to begin.</p>
                </div>`;
            }
          },
          practiceBlock,
          {
            type: jsPsychHtmlKeyboardResponse,
            stimulus: function () {
              const passed = practiceCorrect >= 13;
              const color = passed ? "#00FF00" : "#FF0000";
              if (requirePass) {
                return `
                <div class="instr-view">
                  <h2 style="color: ${color};">Practice ${passed ? 'Complete' : 'Incomplete'}</h2>
                  <p>Score: ${practiceCorrect} / ${practiceItems.length}</p>
                  <p>${passed ? 'Great job. Press any key to start the experiment.'
                    : "You need 75% correct. Let's try again."}</p>
                </div>`;
              } else {
                return `
                <div class="instr-view">
                  <h2 style="color: #00FF00;">Practice complete</h2>
                  <p>The real <strong>${practiceModality.toUpperCase()}</strong> trials will now begin.</p>
                  <p>Press any key to continue.</p>
                </div>`;
              }
            }
          }
        ],
        loop_function: function () {
          // only loop if requirePass is true and they didn't reach 13
          return requirePass && practiceCorrect < 13;
        }
      };

      return practiceWrapper;
    }

    // First practice: start modality, must pass
    timeline.push(buildPractice(startModality, true));

    /* --- MAIN EXPERIMENT ---
       Two modality phases. Each phase has exactly 4 blocks built from phaseBlocks[]:
         Block 0: pairOrder[0] + videoA   (e.g. Frozen + videoA)
         Block 1: pairOrder[1] + videoA   (e.g. Video  + videoA)
         Block 2: pairOrder[0] + videoB   (e.g. Frozen + videoB)
         Block 3: pairOrder[1] + videoB   (e.g. Video  + videoB)
   
       Stimulus key format in CSV:  "<Modality>_<Condition>_<VideoLetter>"
         e.g. "Audio_Frozen_A", "Audio_Video_A", "Audio_Frozen_B", "Audio_Video_B"
               "Visual_Frozen_A", etc.
       Each key should have exactly 25 items in the CSV.
    ----------------------------------------------------------------- */
    let blockCounter = 0;

    [startModality, otherModality].forEach((mod, phaseIndex) => {

      // Modality switch screen between the two phases
      if (phaseIndex === 1) {
        timeline.push({
          type: jsPsychHtmlKeyboardResponse,
          stimulus: `
          <div class="instr-view">
            <h1 style="color: #FFD700;">MODALITY SWITCH</h1>
            <p style="font-size: 1.3em;">You will now switch to <strong>${mod.toUpperCase()}</strong> trials.</p>
            <p>You will start with some practice trials.</p>
            <p>Press any key to continue.</p>
          </div>`,
          on_start: () => {
            const v = document.getElementById("distractor-video");
            if (v) { v.pause(); v.style.visibility = "hidden"; }
          },
          on_finish: () => {
            const v = document.getElementById("distractor-video");
            if (v) { v.style.visibility = "visible"; }
          }
        });
        timeline.push(buildPractice(mod,false));
      }

      // Build 4 cells (WORD/NONWORD × HF/LF) from this modality's 200-item pool,
      // shuffle each fresh per participant, then deal them evenly across 4 blocks.
      const pool = (mainMap[mod] || []);
      const cells = {};
      ["WORD", "NONWORD"].forEach(function (typ) {
        ["HF", "LF"].forEach(function (freq) {
          const c = pool.filter(function (it) {
            return it.StimulusType === typ && it.WordFrequency === freq;
          });
          for (let i = c.length - 1; i > 0; i--) {          // Fisher–Yates shuffle
            const j = Math.floor(Math.random() * (i + 1));
            [c[i], c[j]] = [c[j], c[i]];
          }
          cells[typ + "_" + freq] = c;
        });
      });

      // Deal each cell as evenly as possible across the 4 blocks
      const blockItemsArr = [[], [], [], []];
      Object.keys(cells).forEach(function (cellKey) {
        const items = cells[cellKey];
        const n = items.length;
        let idx = 0;
        for (let b = 0; b < 4; b++) {
          const take = Math.floor(n / 4) + (b < (n % 4) ? 1 : 0);
          for (let k = idx; k < idx + take; k++) blockItemsArr[b].push(items[k]);
          idx += take;
        }
      });

      // Build the 4 blocks, pairing each with its phaseBlocks condition/video
      phaseBlocks.forEach(function (block, blockIndex) {
        const condition = block.condition;
        const videoFile = block.videoFile;
        const videoLetter = videoFile.includes("videoA") ? "A" : "B";

        const blockItems = blockItemsArr[blockIndex].map(function (item) {
          return Object.assign({}, item, {
            Condition: condition,        // assigned at runtime
            VideoLetter: videoLetter,    // assigned at runtime
            Modality: mod,
            stimulus_list_csv: mod + "_" + condition + "_" + videoLetter  // for your data
          });
        });

        if (blockItems.length === 0) {
          console.warn("No items for " + mod + " block " + blockIndex + " — skipped.");
          return;
        }

        timeline.push(makeVideoGate(condition, videoFile));
        timeline.push({
          timeline: [
            makeFixationTrial(),
            makeLdtTrial(false),
            makeTimeoutFeedback(),
            makeCorrectnessFeedback()
          ],
          timeline_variables: blockItems,
          randomize_order: true,
          on_timeline_start: function () {
            applyVideoCondition(condition, videoFile);
            errorCountInBlock = 0;
          }
        });
        blockCounter++;

        if (blockCounter === 8) {
          timeline.push(goodbye_screen);
        } else {
          timeline.push(blockBreak);
        }
      });
    });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("simulate") === "1") {
      jsPsych.simulate(timeline, "data-only");
    } else {
      jsPsych.run(timeline);
    }
  }

  /* -------------------------------------------------------------------------
     Step 12 — Entry Point
     ------------------------------------------------------------------------- */
  function start() {
    console.log("DEBUG: Start function triggered.");
    Promise.all([
      loadStimuli("stimuli/trials_list_practice.csv"),
      loadStimuli("stimuli/stimuli.csv")
    ])
      .then(function (results) {
        const allItems = Object.values(results[0]).flat().concat(Object.values(results[1]).flat());
        const audioList = allItems.map(item => item.AudioFile);
        console.log("Assets ready. Preloading audio durations...");
        return preloadAudioDurations(allItems).then(function () {
          console.log("Audio durations loaded:", Object.keys(audioDurations).length);
          runExperiment(results[0], results[1], audioList);
        });
      })
      .catch(function (err) {
        console.error("Failed to load stimuli:", err);
        document.body.innerHTML = `<div style="color:white; background:red; padding:20px;">
      <h1>Loading Error</h1>
      <p>Could not find the stimuli CSV files. Check your /stimuli folder.</p>
      <p>Error: ${err}</p>
    </div>`;
      });
  }

  if (typeof jatos !== "undefined") {
    jatos.onLoad(start);
  } else {
    start();
  }
