// ==UserScript==
// @name         X 内容警告移除
// @namespace    https://github.com/SwordHand/x-tool
// @version      1.5
// @description  移除 X 敏感内容成人警告，支持解析并下载视频各种画质
// @author       SwordHand
// @match        https://x.com/*
// @match        https://twitter.com/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      tweeload.aculix.net
// @connect      video.twimg.com
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const style = document.createElement('style');
    style.textContent = `
        #xbypass-indicator {
            position: fixed; top: 20px; right: 20px;
            width: 16px; height: 16px; border-radius: 50%;
            background: #00ff66; border: 2px solid #fff;
            box-shadow: 0 0 10px rgba(0,0,0,0.3);
            z-index: 9999999; cursor: pointer;
            transition: all 0.2s ease;
        }
        #xbypass-indicator[data-state="ok"] { background: #00ff66; box-shadow: 0 0 15px #00ff66; }
        #xbypass-indicator[data-state="err"] { background: #ff3333; box-shadow: 0 0 15px #ff3333; }

        .x-subtitle-download-btn-container {
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .x-subtitle-download-btn-container button {
            background: transparent;
            border: none;
            outline: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 9999px;
            transition: background-color 0.2s ease;
            padding: 8px;
        }
        .x-subtitle-download-btn-container button:hover {
            background-color: rgba(29, 155, 240, 0.1);
        }
        .x-subtitle-download-btn-container button:hover svg {
            color: rgb(29, 155, 240) !important;
        }

        .x-download-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); z-index: 10000000;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(2px);
        }
        .x-download-modal {
            background: #ffffff; border: 1px solid #cfd9de; color: #000000;
            border-radius: 16px; width: 340px; padding: 20px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .x-download-modal-title {
            margin: 0 0 16px 0; font-size: 18px; text-align: center; font-weight: bold;
            color: #000000;
        }
        .x-download-option-btn {
            background: #f7f9f9; border: 1px solid #cfd9de; color: #000000;
            border-radius: 8px; padding: 12px; margin-bottom: 8px;
            cursor: pointer; text-align: left; width: 100%;
            transition: background 0.2s; display: flex; justify-content: space-between; align-items: center;
            box-sizing: border-box;
        }
        .x-download-option-btn:hover {
            background: #eff1f1;
        }
        .x-download-option-res {
            font-weight: bold; color: #000000; font-size: 15px;
        }
        .x-download-option-bitrate {
            color: #000000; font-size: 13px; opacity: 0.7;
        }
        .x-download-modal-close {
            background: #000000; color: #ffffff; border: none;
            border-radius: 9999px; padding: 12px 0; width: 100%;
            font-weight: bold; cursor: pointer; margin-top: 12px; transition: background 0.2s;
            display: flex; justify-content: center; align-items: center; text-align: center;
            box-sizing: border-box;
        }
        .x-download-modal-close:hover {
            background: #272c30;
        }
    `;
    document.documentElement.appendChild(style);

    const dot = document.createElement('div');
    dot.id = 'xbypass-indicator';
    dot.dataset.state = 'ok';
    dot.title = 'X 警告移除: ACTIVE';
    document.documentElement.appendChild(dot);

    let status = 'ok';

    function deepClean(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        if (obj.mediaVisibilityResults) {
            delete obj.mediaVisibilityResults;
        }
        if (obj.limitedActionResults) {
            delete obj.limitedActionResults;
        }

        if (obj.tweet && typeof obj.tweet === 'object') {
            if (obj.tweet.possibly_sensitive !== undefined) {
                obj.tweet.possibly_sensitive = false;
            }
            if (obj.tweet.legacy) {
                obj.tweet.legacy.possibly_sensitive = false;
            }
        }

        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                obj[key] = deepClean(obj[key]);
            }
        }
        return obj;
    }

    const originalParse = targetWindow.JSON.parse;

    targetWindow.JSON.parse = function (text) {
        let result;
        try {
            result = originalParse.apply(this, arguments);

            if (result && typeof result === 'object') {
                deepClean(result);
            }
        } catch (e) {
            status = 'err';
            dot.dataset.state = 'err';
            return originalParse.apply(this, arguments);
        }

        return result;
    };

    function showQualityDialog(videoUrls, tweetId) {
        const overlay = document.createElement('div');
        overlay.className = 'x-download-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'x-download-modal';

        const title = document.createElement('h3');
        title.className = 'x-download-modal-title';
        title.textContent = '选择视频下载画质';
        modal.appendChild(title);

        const optionsContainer = document.createElement('div');

        videoUrls.forEach((item) => {
            const resMatch = item.url.match(/(\d+x\d+)/);
            const resolution = resMatch ? resMatch[1] : '未知尺寸';
            const bitrateMbps = item.bitrate ? (item.bitrate / 1000000).toFixed(2) + ' Mbps' : '未知比特率';

            const optBtn = document.createElement('button');
            optBtn.className = 'x-download-option-btn';
            optBtn.innerHTML = `
                <span class="x-download-option-res">${resolution}</span>
                <span class="x-download-option-bitrate">${bitrateMbps}</span>
            `;

            optBtn.addEventListener('click', () => {
                downloadVideo(item.url, `X_Video_${tweetId}_${resolution}.mp4`);
                closeModal();
            });

            optionsContainer.appendChild(optBtn);
        });

        modal.appendChild(optionsContainer);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'x-download-modal-close';
        closeBtn.textContent = '取消';
        closeBtn.addEventListener('click', closeModal);
        modal.appendChild(closeBtn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function closeModal() {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }
    }

    function downloadVideo(url, filename) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            onload: function (response) {
                if (response.status === 200) {
                    const blob = response.response;
                    const blobUrl = window.URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();

                    window.URL.revokeObjectURL(blobUrl);
                    document.body.removeChild(a);
                } else {
                    fallbackDownload(url);
                }
            },
            onerror: function () {
                fallbackDownload(url);
            }
        });
    }

    function fallbackDownload(url) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
    }

    function addDownloadButton(actionBar, url) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'css-175oi2r r-18u37iz r-1h0z5md r-13awgt0 x-subtitle-download-btn-container';

        const button = document.createElement('button');
        button.className = 'css-175oi2r r-1777fci r-bt1l66 r-bztko3 r-lrvibr r-1loqt21 r-1ny4l3l';
        button.type = 'button';
        button.setAttribute('aria-label', '下载视频');
        button.title = '解析并下载视频';

        const innerDiv = document.createElement('div');
        innerDiv.dir = 'ltr';
        innerDiv.className = 'css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-1qd0xha r-a023e6 r-rjixqe r-16dba41 r-1awozwy r-6koalj r-1h0z5md r-o7ynqc r-clp7b1 r-3s2u2q';
        innerDiv.style.color = 'rgb(83, 100, 113)';

        const svgWrapper = document.createElement('div');
        svgWrapper.className = 'css-175oi2r r-xoduu5';
        svgWrapper.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true" class="r-4qtqp9 r-yyyyoo r-dnmrzs r-bnwqim r-lrvibr r-m6rgpd r-1xvli5t r-1hdv0qi" style="width: 1.25em; height: 1.25em;">
                <g>
                    <path d="M12 16l-5-5h3V3h4v8h3l-5 5zm9 2H3v2h18v-2z" fill="currentColor"></path>
                </g>
            </svg>
        `;

        innerDiv.appendChild(svgWrapper);
        button.appendChild(innerDiv);
        btnContainer.appendChild(button);

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const idMatch = url.match(/status\/(\d+)/);
            if (!idMatch) {
                alert('解析推文 ID 失败！');
                return;
            }
            const tweetId = idMatch[1];

            button.style.opacity = '0.5';
            button.disabled = true;

            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://tweeload.aculix.net/status/${tweetId}.json`,
                headers: {
                    'Authorization': 'cKMQlY4jGCflOStlN3UfnWCxLQSb5GL7UPjPJ3jGS5fkno1Jaf'
                },
                onload: function (response) {
                    try {
                        if (response.status === 200) {
                            const data = JSON.parse(response.responseText);
                            const videoUrls = data?.tweet?.media?.videos?.[0]?.video_urls;

                            if (data.code === 200 && videoUrls && videoUrls.length > 0) {
                                showQualityDialog(videoUrls, tweetId);
                            } else {
                                alert('未解析到有效的视频下载地址或该接口不可用');
                            }
                        } else {
                            alert(`请求失败，状态码: ${response.status}`);
                        }
                    } catch (error) {
                        alert('解析服务器返回的数据时发生错误。');
                    } finally {
                        button.style.opacity = '1';
                        button.disabled = false;
                    }
                },
                onerror: function (error) {
                    alert('网络请求发生错误，已被拦截或目标服务器故障。');
                    button.style.opacity = '1';
                    button.disabled = false;
                }
            });
        });

        actionBar.appendChild(btnContainer);
    }

    function checkAndInjectSubtitleButtons() {
        const videoComponents = document.querySelectorAll('[data-testid="videoComponent"][data-immersive-translate-ai-subtitle-url]');

        videoComponents.forEach(video => {
            if (video.dataset.downloadBtnAdded) return;

            const tweet = video.closest('article');
            if (!tweet) return;

            const actionBar = tweet.querySelector('[role="group"]');
            if (!actionBar) return;

            const url = video.getAttribute('data-immersive-translate-ai-subtitle-url');

            if (!actionBar.querySelector('.x-subtitle-download-btn-container')) {
                addDownloadButton(actionBar, url);
            }

            video.dataset.downloadBtnAdded = 'true';
        });
    }

    const observer = new MutationObserver(() => {
        checkAndInjectSubtitleButtons();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    dot.addEventListener('click', function () {
        alert('X 成人内容警告移除\n\n状态: ' +
              (status === 'ok' ? '正常 ✅' : '异常 ❌'));
    });
})();