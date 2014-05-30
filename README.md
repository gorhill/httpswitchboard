# HTTP Switchboard for Chromium

See [Change log](https://github.com/gorhill/httpswitchboard/wiki/Change-log) for latest changes.

A Chromium browser extension which let you whitelist or blacklist requests
originating from within a web page according to their type and/or destination
as per domain name. As of May 2014, the extension comes with preset blacklists
totaling over 60,000 distinct hostnames out of the box (these lists can be
disabled, or more can be enabled).

Much effort has been spent on creating **highly efficient filtering engines**: 
HTTPSB can hold tens of thousands more filtering rules in memory while having a
significantly smaller memory and CPU footprint than other comparable popular
blockers.

HTTPSB was running with over 115K filters, **tens of thousands more** than other blockers, after running this [reference benchmark](/gorhill/httpswitchboard/wiki/Comparative-benchmarks-against-widely-used-blockers:-Top-15-Most-Popular-News-Websites) (repeat was set to 2):

<p align="center"><img src="https://raw.githubusercontent.com/gorhill/httpswitchboard/master/doc/img/httpsb-mem-vs-others-mem.png" /></p>

<sup>**Adblock Plus & Adblock:** EasyList, EasyPrivacy, Malware protection. **Adguard:** English filter, Spyware & tracking filter, Phishing & malware protection. **HTTPSB:** 65,935 malware, ads, trackers, etc hostname-based filters, 25,206 ABP-compatible net filters, 24,184 cosmetic filters.</sup>

## Installation

Available from [Chrome web store](https://chrome.google.com/webstore/detail/httpswitchboard/mghdpehejfekicfjcdbfofhcmnjhgaag), 
[Opera add-ons collection](https://addons.opera.com/en-gb/extensions/details/http-switchboard/), 
or you can [install manually](https://github.com/gorhill/httpswitchboard/tree/master/dist). 
**I strongly advise against installing from any other sources.**

I expect the extension to work on a stable release of any Chromium-based browser.

[**IMPORTANT:** Compatibility with various Chromium based browsers and other extensions](https://github.com/gorhill/httpswitchboard/wiki/Compatibility-with-various-Chromium-based-browsers-and-other-extensions)

## The matrix: front end to the matrix filtering engine

<p align="center">
 <a href="https://github.com/gorhill/httpswitchboard/wiki/How-to-use-HTTP-Switchboard:-Two-opposing-views">
  <img src="https://raw.githubusercontent.com/gorhill/httpswitchboard/master/doc/img/screenshot1.png" />
 </a><br>
 <a href="https://github.com/gorhill/httpswitchboard/wiki/How-to-use-HTTP-Switchboard:-Two-opposing-views">Click for more details</a>
</p>

## The filtering engine

<p align="center">
 <a href="https://github.com/gorhill/httpswitchboard/wiki/Net-request-filtering:-overview">
  <img src="https://raw.githubusercontent.com/gorhill/httpswitchboard/master/doc/img/httpsb-overview.png" />
 </a><br>
 <a href="https://github.com/gorhill/httpswitchboard/wiki/Net-request-filtering:-overview">Click for more details</a>
</p>

## Documentation

[More at the wiki](https://github.com/gorhill/httpswitchboard/wiki)

HTTP Switchboard (FOSS) put you in FULL control of where your browser is allowed to connect, what type of data it is allowed to download, and what it is allowed to execute. Nobody else decides for you: You choose. You are in full control of your privacy.

- See ALL the remote connections, failed or attempted, depending on whether they were blocked or allowed (you decide).

- A single-click to whitelist/blacklist one or multiple classes of requests according to the destination and type 
of data (a blocked request will NEVER leave your browser).

- Efficient blacklisting: cookies won't leave your browser, javascript won't execute, plugins won't play, 
tracking pixels won't download, etc.

- You do not have to solely rely on just one particular curated blacklist (arguably with many missing entries) outside which nothing else can be blocked.

- Ease of use: HTTP Switchboard lets you easily whitelist/blacklist net requests which originate from within a web page according to a point-and-click matrix:

* domain names (left column)
    - from very specific
    - to very generic

* type of requests (top row)
    - cookies
    - css (stylesheets and web fonts)
    - images
    - objects
    - scripts
    - XHR (requests made by scripts)
    - frames
    - others (`<video>`, `<audio>`, etc.)

You can blacklist/whitelist a single cell, an entire row, a group of rows, an entire column, or the whole matrix with just one click.

HTTP Switchboard matrix uses precedence logic to evaluate what is blocked/allowed according to which cells are blacklisted/whitelisted. For example, this allows you to whitelist a whole page with one click, without having to repeatedly whitelist whatever new data appear on the page.

You can also create scopes for your whitelist/blacklist rules. For example, this allows you to whitelist `facebook.com` ONLY when visiting Facebook web site.

The goal of this extension is to make the allowing or blocking of web sites, wholly or partly, as straightforward as possible, so as to not discourage those users who give up easily on good security and privacy habits.

As of April 2014, the extension comes with preset blacklists totaling nearly 60,000 distinct hostnames (each list can be disabled/enabled according to your choice, and there are more preset blacklists which you can activate if you wish so).

Ultimately, you can choose however you browse the net:

- Blacklist all by default, and whitelist as needed (default mode).
- Whitelist all by default, and blacklist as needed.

Either way, you still benefit from the preset blacklists so that at least you get basic protection from trackers, malware sites, etc. Or you can disable all of these preset blacklists.

Your choice.

This is pre-version 1.0, more work is intended.

You are very welcomed to contribute your views on open issues and suggestions, various arguments for/against help me in deciding what is needed to improve the extension.

Ease of use is the primary goal. I've seen users give up on Firefox's NoScript because it gets too much in the way according to them, so rather than blame these users for poor security habits, I prefer to blame developers and this project is a tentative to address the issues which cause some users to give up on basic security.

This extension is also useful to understand what the web page in your browser is doing behind the scene. You have full ability to see and decide with whom a web page communicates, and to restrict these communications to specific classes of objects within the web page.

The number which appear in the extension icon correspond to the total number of distinct requests attempted (successfully or not depending on whether these were allowed or blocked) behind the scene.

Simply click on the appropriate entry in the matrix in order to white-, black- or graylist a component. Graylisting means the blocked or allowed status will be inherited from another entry with higher precedence in the matrix.

Red square = effectively blacklisted, i.e. requests are prevented from reaching their intended destination:

- Dark red square: the domain name and/or type of request is specifically blacklisted.
- Faded red square: the blacklist status is inherited because the entry is graylisted.

Green square = effectively whitelisted, i.e. requests are allowed to reach their intended destination:

- Dark green square: the domain name and/or type of request is specifically whitelisted.
- Faded green square: the whitelist status is inherited because the entry is graylisted.

The top-left cell in the matrix represents the default global setting, which allows you to choose whether allowing or blocking everything is the default behavior. Some prefer to allow everything while blocking exceptionally. My personal preference is of course the reverse, blocking everything and allowing exceptionally.

This extension is also useful if you wish to speed up your browsing, by blocking all requests for images as an example.

## About

HTTP Switchboard is the fruit of a personal project, there no company of any kind involved, therefore no agenda other than giving users the tools to be in complete control of their browser. I appreciate the thought, but I do not want donation, now or in the future.

If you **REALLY** want to give something in return, then my wish would be that you direct your donation to an organisation genuinely dedicated to defend basic principles of democracy. Examples: [Freedom of the Press Foundation](https://pressfreedomfoundation.org/), [EFF](https://www.eff.org/), [Wikileaks](https://wikileaks.org/), or whatever non-for-profit organisation fits the _"genuinely dedicated to defend basic principles of democracy"_ profile in your home country.

You can also donate to those who maintain and generously make available for personal use the [third-party assets](https://github.com/gorhill/httpswitchboard/tree/master/assets/thirdparties) which you use in HTTPSB.

Also, can't deny it, encouraging comments from the stores or elsewhere do help.

## License

<a href="https://github.com/gorhill/httpswitchboard/blob/master/LICENSE.txt">GPLv3</a>.
