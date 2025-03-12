$(function () {
    const { InferenceEngine, CVImage } = inferencejs;
    const inferEngine = new InferenceEngine();
    const video = $("video")[0];

    var workerId;
    var totalAmount = 0;
    var detectedBills = [];
    var currentStream = null;
    var backCameraId = null; // Store the rear camera ID

    const currencyValues = {
        "1": 1, "10": 10, "100": 100, "1000": 1000,
        "20": 20, "200": 200, "5": 5, "50": 50, "500": 500
    };

    // Add a button for switching to the rear camera
    const rearCameraBtn = $("<button id='rearCameraBtn'>Use Rear Camera</button>");
    rearCameraBtn.css({ top: "170px", background: "#ffaa00" });
    $("body").append(rearCameraBtn);

    navigator.mediaDevices.enumerateDevices().then((devices) => {
        const videoDevices = devices.filter(device => device.kind === "videoinput");
        const cameraSelect = $("#cameraSelect");

        videoDevices.forEach((device, index) => {
            const option = $("<option>")
                .val(device.deviceId)
                .text(device.label || `Camera ${index + 1}`);
            cameraSelect.append(option);

            // Identify rear camera
            if (device.label.toLowerCase().includes("back") || device.label.toLowerCase().includes("rear")) {
                backCameraId = device.deviceId;
            }
        });

        // Default to first camera
        if (videoDevices.length > 0) {
            startCamera(videoDevices[0].deviceId);
        }

        // Camera dropdown change event
        cameraSelect.change(function () {
            startCamera($(this).val());
        });
    });

    // Button event to switch to rear camera manually
    $("#rearCameraBtn").click(function () {
        if (backCameraId) {
            startCamera(backCameraId);
        } else {
            alert("No rear camera detected.");
        }
    });

    function startCamera(deviceId) {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } })
            .then((stream) => {
                currentStream = stream;
                video.srcObject = stream;
            })
            .catch((error) => console.error("Error accessing camera:", error));
    }

    const loadModelPromise = new Promise((resolve, reject) => {
        inferEngine.startWorker("neuronotev3", "1", "rf_0aN8YUDixuT9HYFLVQo1Ez2FcUk2")
            .then((id) => {
                workerId = id;
                resolve();
            })
            .catch(reject);
    });

    loadModelPromise.then(() => {
        $("body").removeClass("loading");
        resizeCanvas();
        detectFrame();
    });

    var canvas, ctx;

    function resizeCanvas() {
        $("canvas").remove();
        canvas = $("<canvas/>");
        ctx = canvas[0].getContext("2d");

        canvas[0].width = video.videoWidth;
        canvas[0].height = video.videoHeight;

        canvas.css({
            width: "100%",
            height: "100%",
            position: "absolute",
            top: "0",
            left: "0",
            zIndex: 5
        });

        $("body").append(canvas);
    }

    function renderPredictions(predictions) {
        ctx.clearRect(0, 0, canvas[0].width, canvas[0].height);
        detectedBills = [];

        predictions.forEach((prediction) => {
            const x = prediction.bbox.x;
            const y = prediction.bbox.y;
            const width = prediction.bbox.width;
            const height = prediction.bbox.height;
            const accuracy = (prediction.confidence * 100).toFixed(2) + "%";

            ctx.strokeStyle = "green";
            ctx.lineWidth = 4;
            ctx.strokeRect(x - width / 2, y - height / 2, width, height);

            ctx.fillStyle = "green";
            ctx.fillRect(x - width / 2, y - height / 2 - 20, 80, 20);

            ctx.font = "16px sans-serif";
            ctx.fillStyle = "#000";
            ctx.fillText(`${prediction.class} (${accuracy})`, x - width / 2 + 4, y - height / 2 - 4);

            if (currencyValues[prediction.class]) {
                detectedBills.push(currencyValues[prediction.class]);
            }
        });
    }

    var prevTime;
    var pastFrameTimes = [];

    function detectFrame() {
        if (!workerId) return requestAnimationFrame(detectFrame);

        const image = new CVImage(video);
        inferEngine.infer(workerId, image)
            .then((predictions) => {
                requestAnimationFrame(detectFrame);
                renderPredictions(predictions);

                $("#captureBtn").off("click").on("click", function () {
                    totalAmount += detectedBills.reduce((a, b) => a + b, 0);
                    $("#totalAmount").text(`Total: ${totalAmount} PHP`);
                    announceTotal(totalAmount);
                });

                $("#clearBtn").off("click").on("click", function () {
                    totalAmount = 0;
                    $("#totalAmount").text(`Total: 0 PHP`);
                });

                if (prevTime) {
                    pastFrameTimes.push(Date.now() - prevTime);
                    if (pastFrameTimes.length > 30) pastFrameTimes.shift();

                    var total = pastFrameTimes.reduce((a, b) => a + b, 0) / 1000;
                    $("#fps").text(Math.round(pastFrameTimes.length / total) + " fps");
                }
                prevTime = Date.now();
            })
            .catch(() => requestAnimationFrame(detectFrame));
    }

    function announceTotal(amount) {
        let msg = new SpeechSynthesisUtterance(`Total amount detected is ${amount} pesos.`);
        window.speechSynthesis.speak(msg);
    }
});
