var fntParseASCII = require('parse-bmfont-ascii')
// // TODO: why does this break loading??
// //var fntParseXML = require('parse-bmfont-xml')
var fntParseBinary = require('parse-bmfont-binary')

export class BMFont {
  constructor(descriptor_text, image_assets, thresholds) {
    this.descriptor = descriptor_text;
    this.images = image_assets.map(raw_asset => Expo.Asset.fromModule(raw_asset));
    this.assets_loaded = false;
    this.gl_resources = null
    this.thresholds = thresholds;
    if (!("normal" in thresholds) ||
        !("bold" in thresholds) ||
        !("bolder" in thresholds) ||
        !("lighter" in thresholds)) {
      throw new SyntaxError("Missing distance field threshold");
    }
  }

  async await_assets() {
    await Promise.all(this.images.map(asset => asset.downloadAsync()));
    this.assets_loaded = true;
  }

  initialize_gl_resources (gl) {
    if (this.gl_resources !== null) {
      return this.gl_resources;
    }

    if (this.assets_loaded != true) {
      throw new ReferenceError("Must load font assets before initializing GL resources");
    }

    // TODO: detect whether ascii/xml/etc
    // TODO: figure out how to actually grab this txt:
    
    let bmfont_descriptor = fntParseASCII(this.descriptor);

    let texture_array = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture_array);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY,
      1,
      gl.RGBA8,
      bmfont_descriptor.common.scaleW,
      bmfont_descriptor.common.scaleH,
      bmfont_descriptor.common.pages
    );

    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let textures_by_name = {}
    this.images.map(texture_asset => {
      textures_by_name[texture_asset.name+"."+texture_asset.type] = texture_asset;
    });

    for (let i = 0; i < bmfont_descriptor.pages.length; i++) {
      let page_texture = textures_by_name[bmfont_descriptor.pages[i]];
      if (page_texture) {
        gl.texSubImage3D(
          gl.TEXTURE_2D_ARRAY,
          0,
          0,
          0,
          i,
          bmfont_descriptor.common.scaleW,
          bmfont_descriptor.common.scaleH,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          page_texture
        );
      } else {
        throw new ReferenceError('Glyph page "' + bmfont_descriptor.pages[i] + '" not found in provided assets');
      }
    }

    font_descriptor = {};
    font_descriptor.textures = texture_array;
    font_descriptor.chars = {};
    bmfont_descriptor.chars.map(char => {
      font_descriptor.chars[String.fromCharCode(char.id)] = char
      char.u1 = char.x / bmfont_descriptor.common.scaleW;
      char.v1 = char.y / bmfont_descriptor.common.scaleH;
      char.u2 = char.u1 + (char.width / bmfont_descriptor.common.scaleW);
      char.v2 = char.v1 + (char.height / bmfont_descriptor.common.scaleH);
    });

    font_descriptor.kernings = {};
    bmfont_descriptor.kernings.map(kerning => {
      let first = String.fromCharCode(kerning.first);
      let second = String.fromCharCode(kerning.second);
      if (!(first in font_descriptor.kernings)) {
        font_descriptor.kernings[first] = {};
      }
      font_descriptor.kernings[first][second] = kerning.amount;
    });

    font_descriptor.info = bmfont_descriptor.info;
    font_descriptor.common = bmfont_descriptor.common;
    
    font_descriptor.info.thresholds = this.thresholds;

    this.gl_resources = font_descriptor;

    return this.gl_resources;
  }

}
