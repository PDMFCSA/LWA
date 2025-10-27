let currentVideoPlaying = "";
const mediaUrlRegex = new RegExp(/^\s*data:([a-z]+\/[a-z4]+(;[a-z-]+=[a-z-]+)?)?(;base64)?,[a-z0-9!$&',()*+;=\-._~:@/?%\s]*\s*$/i);

/**
 * Observer for play/pause video
 *
 * @param {object} htmlContent
 * @return {object} 
 * @memberof leafletXSL
 */
const observerVideos = function(section, sectionActive) {
    const videos = document.querySelectorAll('video');
    if(videos) {
        function pauseVideo(video) {
            if(!video.paused && !video.ended && video.readyState > 2)
                video.pause();
        }

        const options = {
            root: null, 
            rootMargin: "0px",
            threshold: 1, // Trigger when of all video component is in view
        };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const video = entry.target;
                if (entry.isIntersecting) {
                    currentVideoPlaying = video.id;
                    if(!video.ended)
                        video.play();
                    setTimeout(() => {
                        videos.forEach((v) => {
                            if(currentVideoPlaying !== v.id)
                                pauseVideo(v);
                        });
                    }, 200)
                }  
            });
        }, options);

        const sectionVideos = section.querySelectorAll('video');
        if(sectionActive) {
            sectionVideos.forEach((video) => observer.observe(video));
        } else {
            sectionVideos.forEach((video) => {
                pauseVideo(video);
                observer.unobserve(video)
            });
        }
       

        // const sectionVideos = section.querySelectorAll("video");
        // sectionVideos.forEach((video) => {
        //     if(sectionActive) {
        //         observer.observe(video);
        //     } else {
        //         pauseVideo(video);
        //         observer.unobserve(video)
        //     }
        // });
    }
};

/**
 * Some fixes on html content
 *
 * @param {object} htmlContent
 * @return {object} 
 * @memberof leafletXSL
 */
const fixHTML = function(htmlContent) {
    fixTables(htmlContent);
    fixTitles(htmlContent);

    return htmlContent
}

/**
 * Fix tables containers 
 *
 * @param {object} htmlContent
 * @return {void} 
 * @memberof leafletXSL
 */
const fixTables = function(htmlContent) {
    const tables = htmlContent.querySelectorAll('table');
    if(tables) 
        tables.forEach(table => {
        for (let i = 0; i < table.attributes.length; i++) {
            const {name} = table.attributes[i];
            if(name === 'xmlns') 
                table.removeAttribute('xmlns');
        }
        try {
            table.outerHTML = `<div class="table-container">${table.outerHTML}</div>`
        } catch(error) {
            console.error(`Error fixing table: ${error.message}`);
        }
    })
}

  
/**
 * Fix tab index on section titles
 *
 * @param {object} xmlContent
 * @return {void} 
 * @memberof leafletXSL
 */
const fixTitles = function(htmlContent) {
    const sections = htmlContent.querySelectorAll(".leaflet-accordion-item");
    for(let section of sections) {
        const title = section.querySelector('h2');
        if(title) {
            // const regex = /\.{2}$|[:.]$/;
            // // check ponctuation
            // if(regex.test(title.textContent)) {
            //     console.log('has ' + title.textContent)
            //     title.querySelector('span.invisible').remove();

            // }  
            // fixing tab index
            if(title.hasAttribute('tabindex')) {
                title.removeAttribute('tabindex');
                section.setAttribute('tabindex', 0);
            }
        }     
    }
}

const defaultXslContent = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                xmlns:xs="urn:hl7-org:v3"
                xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xsi:schemaLocation="urn:hl7-org:v3 https://www.accessdata.fda.gov/spl/schema/spl.xsd">
    <xsl:output method="html"/>

    <!--setting identity transformation-->
    <xsl:template match="@*|node()">
        <xsl:copy>
            <xsl:apply-templates select="@*|node()"/>
        </xsl:copy>
    </xsl:template>

    <xsl:template match="xs:document">
        <div class="accordion">
            <xsl:apply-templates select="@*|node()"/>
        </div>
    </xsl:template>

    <xsl:template match="xs:document/xs:component">
        <xsl:apply-templates select="@*|node()"/>
    </xsl:template>

    <xsl:template match="xs:component/xs:structuredBody">
        <xsl:apply-templates select="@*|node()"/>
    </xsl:template>

    <xsl:template match="xs:structuredBody/xs:component">
        <xsl:apply-templates select="@*|node()"/>
    </xsl:template>

    <xsl:template match="xs:paragraph">
        <p aria-live="polite" tabindex="0">
            <xsl:apply-templates select="@*|node()"/>
        </p>
    </xsl:template>


    <xsl:template match="xs:list">
        <ul role="list">
            <xsl:apply-templates select="@*|node()"/>
        </ul>
    </xsl:template>

    <xsl:template match="xs:item">
        <li role="list-item" tabindex="0">
            <xsl:apply-templates select="@*|node()"/>
        </li>
    </xsl:template>

    <xsl:template match="xs:linkHtml">
        <xsl:variable name="_href">
            <xsl:value-of select="@href"/>
        </xsl:variable>
        <xsl:variable name="firstLetter" select="substring($_href,1,1)"/>
        <xsl:choose>
            <xsl:when test="$firstLetter != '#'">
                <a target="_blank">
                    <xsl:attribute name="href">
                        <xsl:value-of select="@href"/>
                    </xsl:attribute>
                    <xsl:value-of select="."/>
                </a>
            </xsl:when>
            <xsl:otherwise>
                <span class="leaflet-link" role="link" tabindex="0">
                    <xsl:attribute name="linkUrl">
                        <xsl:value-of select="@href"/>
                    </xsl:attribute>
                    <xsl:value-of select="."/>
                </span>
            </xsl:otherwise>
        </xsl:choose>

    </xsl:template>

    <xsl:template match="xs:section">
        <xsl:choose>
            <xsl:when test="xs:code/@displayName != 'SPL LISTING DATA ELEMENTS SECTION'">
                <div class="leaflet-accordion-item" role="button" aria-expanded="false">
                    <xsl:attribute name="sectionCode">
                        <xsl:value-of select="xs:code/@code"/>
                    </xsl:attribute>
                    <h2 tabindex="0">
                        <!--<xsl:value-of select="xs:code/@displayName"/>-->
                        <xsl:variable name="partialTitle" select="substring(xs:code/@displayName,2)"/>
                        <xsl:variable name="firstLetter" select="substring(xs:code/@displayName,1,1)"/>
                        <xsl:variable name="modifiedTitle">
                            <xsl:value-of
                                    select="concat($firstLetter,translate($partialTitle,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'))"/>
                        </xsl:variable>
                        <xsl:value-of select="$modifiedTitle"/>
                        <span class="voiceover-pause">.</span>

                    </h2>
                    <div class="leaflet-accordion-item-content">
                        <xsl:apply-templates select="@*|node()"/>
                    </div>
                </div>
            </xsl:when>
            <xsl:otherwise></xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template match="xs:section/xs:component/xs:section">
        <div>
            <h3 tabindex="0">
                <!--<xsl:value-of select="xs:code/@displayName"/>-->
                <xsl:variable name="partialTitle" select="substring(xs:code/@displayName,2)"/>
                <xsl:variable name="firstLetter" select="substring(xs:code/@displayName,1,1)"/>
                <xsl:variable name="modifiedTitle">
                    <xsl:value-of
                            select="concat($firstLetter,translate($partialTitle,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'))"/>
                </xsl:variable>
                <xsl:value-of select="$modifiedTitle"/>
            </h3>
            <div>
                <xsl:apply-templates select="@*|node()"/>
            </div>
        </div>
    </xsl:template>

    <xsl:template match="xs:content">
        <xsl:choose>
            <xsl:when test="@styleCode = 'bold'">
                <b>
                    <xsl:value-of select="."/>
                </b>
            </xsl:when>
            <xsl:when test="@styleCode = 'underline'">
                <u>
                    <xsl:value-of select="."/>
                </u>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="."/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <xsl:template match="xs:renderMultiMedia">
        <xsl:apply-templates select="//xs:observationMedia[@ID=current()/@referencedObject]"/>
    </xsl:template>

    <xsl:template match="xs:observationMedia">
        <img>
            <xsl:attribute name="src">
                <xsl:value-of select="concat($resources_path, xs:value/xs:reference/@value)"/>
            </xsl:attribute>
            <xsl:attribute name="alt">
                <xsl:value-of select="xs:text"/>
            </xsl:attribute>
        </img>
    </xsl:template>

    <xsl:template match="xs:document/xs:title">
        <accordion-item>
            <xsl:attribute name="shadow"/>
            <xsl:attribute name="title">
                Highlights of prescribing information
            </xsl:attribute>
            <!-- <xsl:attribute name="opened">
                opened
            </xsl:attribute> -->
            <div class="accordion-item-content" slot="item-content">
                <xsl:apply-templates select="@*|node()"/>
            </div>
        </accordion-item>
    </xsl:template>

    <xsl:template match="video">
        <video id="{generate-id()}">
            <xsl:copy-of select="@*[name() != 'autoplay']"/>
            <xsl:if test="not(@controls)">
                <xsl:attribute name="controls">true</xsl:attribute>
            </xsl:if>
            <xsl:attribute name="muted"></xsl:attribute>
            <xsl:attribute name="playsinline"></xsl:attribute>
            <xsl:attribute name="preload">metadata</xsl:attribute>
            <xsl:apply-templates/>
        </video>
    </xsl:template>

    <!--nodes or attributes that we need to hide for a cleaner output-->
    <xsl:template
            match="xs:author|xs:id|xs:document/xs:code|xs:document/xs:effectiveTime|xs:document/xs:setId|xs:document/xs:versionNumber">
        <!--hide selected nodes-->
    </xsl:template>
</xsl:stylesheet>`

const acodisXslContent =  `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                xmlns:xs="urn:hl7-org:v3"
                xmlns="urn:hl7-org:v3" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xsi:schemaLocation="urn:hl7-org:v3 https://www.accessdata.fda.gov/spl/schema/spl.xsd">

    <xsl:output method="html" version="1.0"
                encoding="UTF-8" indent="yes" doctype-public="-//W3C//DTD XHTML 1.1//EN"/>

    <!--setting identity transformation-->
    <xsl:template match="@*|node()">
        <xsl:copy>
            <xsl:apply-templates select="@*|node()"/>
        </xsl:copy>
    </xsl:template>

    <xsl:template match="document">
            <div><xsl:apply-templates select="@*|node()"/></div>
    </xsl:template>
    
    <xsl:param name="quote">"</xsl:param>
    <xsl:param name="space">\\0020</xsl:param>
    <xsl:template match="//ul">
        <ul role="list">
            <xsl:choose>
                <xsl:when test="contains(@style,'list-style-type')">
                    <xsl:attribute name="style"><xsl:value-of select="@style"/></xsl:attribute>
                </xsl:when>
            </xsl:choose>
            <xsl:apply-templates select="node()" />
        </ul>
    </xsl:template>

    <xsl:template match="//ul/li">
        <li role="list-item" tabindex="0">
            <xsl:choose>
                <xsl:when test="normalize-space(@data-enum) != ''">
                    <xsl:attribute name="style"> list-style-type: <xsl:value-of select="$quote"/><xsl:value-of select="@data-enum"/><xsl:value-of select="$space"/><xsl:value-of select="$quote"/>; </xsl:attribute>
                </xsl:when>
                <xsl:when test="contains(@style,'list-style-type')">
                    <xsl:attribute name="style"><xsl:value-of select="@style"/></xsl:attribute>
                </xsl:when>
            </xsl:choose>
        <xsl:apply-templates select="node()" /></li>
    </xsl:template>

    <xsl:template match="//ol">
        <ol role="list">
            <xsl:choose>
                <xsl:when test="normalize-space(@type) != ''">
                    <xsl:attribute name="type"><xsl:value-of select="@type"/></xsl:attribute>
                </xsl:when>
                <xsl:when test="normalize-space(@data-type) != ''">
                    <xsl:attribute name="style">list-style-type: <xsl:value-of select="@data-type"/>;</xsl:attribute>
                </xsl:when>
            </xsl:choose>
            <xsl:apply-templates select="node()" />
        </ol>
    </xsl:template>

    <xsl:template match="//ol/li">
        <li role="list-item" tabindex="0">
            <xsl:choose>
                <xsl:when test="normalize-space(@data-enum) != ''">
                    <xsl:attribute name="style"> list-style-type: <xsl:value-of select="$quote"/><xsl:value-of select="@data-enum"/><xsl:value-of select="$space"/><xsl:value-of select="$quote"/>; </xsl:attribute>
                </xsl:when>
            </xsl:choose>
        <xsl:apply-templates select="node()" /></li>
    </xsl:template>

    <xsl:template match="//section//p">
        <p aria-live="polite" tabindex="0"><xsl:apply-templates select="node()" /></p>
    </xsl:template>
    
    <xsl:template match="//figure">
        <figure><xsl:apply-templates select="node()" /></figure>
    </xsl:template>

    <xsl:template match="//figure/*[not(self::img)]">
        <section style="display:none;" class="ignore_from_ui"><xsl:apply-templates select="node()" /></section>
    </xsl:template>
    
    
    <xsl:template match="//figure/img">
        <xsl:variable name="_src">
            <xsl:value-of select="@src"/>
        </xsl:variable>
        <img>
            <xsl:attribute name="src">
                <xsl:value-of select="concat($resources_path, $_src)"/>
            </xsl:attribute>
            <xsl:choose>
                <xsl:when test="@alt">
                    <xsl:attribute name="alt">
                        <xsl:value-of select="@alt"/>
                    </xsl:attribute>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:attribute name="alt">
                        <xsl:value-of select="following-sibling::*[1]"/>
                    </xsl:attribute>
                </xsl:otherwise>
            </xsl:choose>
            <xsl:apply-templates select="node()"/>
        </img>
    </xsl:template>

    <xsl:template match="video">
        <video id="{generate-id()}">
            <xsl:copy-of select="@*[name() != 'autoplay']"/>
            <xsl:if test="not(@controls)">
                <xsl:attribute name="controls">true</xsl:attribute>
            </xsl:if>
            <xsl:attribute name="muted"></xsl:attribute>
            <xsl:attribute name="playsinline"></xsl:attribute>
            <xsl:attribute name="preload">metadata</xsl:attribute>
           <xsl:choose>
                <xsl:when test="@aria-label">
                    <xsl:attribute name="aria-label">
                        <xsl:value-of select="@aria-label"/>
                    </xsl:attribute>
                </xsl:when>
                <xsl:otherwise>
                    <xsl:attribute name="aria-label">
                        <xsl:value-of select="@title"/>
                    </xsl:attribute>
                </xsl:otherwise>
            </xsl:choose>
            <xsl:attribute name="title">
                <xsl:value-of select="@title"/>
            </xsl:attribute>
            <xsl:apply-templates/>
        </video>
    </xsl:template>
    
    <xsl:template match="//table">
        <table>
        <xsl:copy-of select="@*" />
          <xsl:apply-templates select="node()" />
        </table>
    </xsl:template>

    <xsl:template match="//th">
        <th>
            <xsl:copy-of select="@*" />
            <xsl:apply-templates select="node()" />
        </th>
    </xsl:template>

    <xsl:template match="//tr">
        <tr>
            <xsl:copy-of select="@*" />
            <xsl:apply-templates select="node()" />
        </tr>
    </xsl:template>

    <xsl:template match="//td">
        <td>
            <xsl:copy-of select="@*" />
            <xsl:apply-templates select="node()" />
        </td>
    </xsl:template>
      
     <xsl:template match="//*[@class='Table of Content']" priority="9">
        <div style="display:none;" class="leaflet_hidden_section ignore_from_ui"><xsl:apply-templates select="@class|node()"/></div>
    </xsl:template>
    
      <xsl:template match="//*[@class='Type']" priority="9">
        <div style="display:none;" class="leaflet_hidden_section ignore_from_ui"><xsl:apply-templates select="@class|node()"/></div>
    </xsl:template>
   
    <xsl:template match="//*[@class='Product_Name']" priority="9">
        <div style="display:none;" class="leaflet_hidden_section ignore_from_ui"><xsl:apply-templates select="@class|node()"/></div>
    </xsl:template>
   <xsl:template match="//*[@class='Ingredient Substance']" priority="9">
        <div style="display:none;" class="leaflet_hidden_section ignore_from_ui"><xsl:apply-templates select="@class|node()"/></div>
    </xsl:template>
   <xsl:template match="//*[@class='Read Instructions']" priority="9">
        <div style="display:none;" class="leaflet_hidden_section ignore_from_ui"><xsl:apply-templates select="@class|node()"/></div>
    </xsl:template>
    <xsl:template match="//*[@class='ignore_from_ui']" priority="9">
        <div style="display:none;" class="leaflet_hidden_section ignore_from_ui"><xsl:apply-templates select="@class|node()"/></div>
    </xsl:template>
    <xsl:template match="document/section">
        <div class="section leaflet-accordion-item" role="button" aria-expanded="false">
            <xsl:apply-templates select="header"/>
                <div class="leaflet-accordion-item-content">
                     <xsl:apply-templates select="*[not(self::header)]"/>
                </div>
        </div>
    </xsl:template>
    
    <xsl:template match="document/section/header">
        <h2 tabindex="0">
            <xsl:apply-templates select="node()" />
            <span class="voiceover-pause">.</span>
        </h2>
    </xsl:template>
</xsl:stylesheet>`;

export {
  defaultXslContent,
  acodisXslContent,
  observerVideos,
  fixHTML,
  mediaUrlRegex
};
