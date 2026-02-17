// StringEncodingTests

import Testing
import Foundation
@testable import Hotline

struct StringEncodingTests {

  // MARK: - readString: UTF-8 decoded first

  @Test func readStringUTF8Trademark() {
    // UTF-8 ™ (E2 84 A2) — previously misdetected as CP1251
    let bytes: [UInt8] = [0x54, 0x68, 0x65, 0x42, 0x72, 0x69, 0x63, 0x6B, 0xE2, 0x84, 0xA2]
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "TheBrick™")
  }

  @Test func readStringUTF8Copyright() {
    // UTF-8 © (C2 A9)
    let bytes: [UInt8] = [0x54, 0x65, 0x73, 0x74, 0xC2, 0xA9]
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "Test©")
  }

  @Test func readStringUTF8EmDash() {
    // UTF-8 em-dash — (E2 80 94)
    let bytes: [UInt8] = [0x48, 0x69, 0x20, 0xE2, 0x80, 0x94, 0x20, 0x42, 0x79, 0x65]
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "Hi — Bye")
  }

  @Test func readStringPureASCII() {
    let bytes: [UInt8] = Array("Hello World".utf8)
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "Hello World")
  }

  @Test func readStringEmptyData() {
    let data = Data()
    #expect(data.readString(at: 0, length: 0) == "")
  }

  // MARK: - readString: Mac OS Roman fallback

  @Test func readStringMacRomanTrademark() {
    // Mac OS Roman ™ is single byte 0xAA — invalid UTF-8, falls to Mac OS Roman
    let bytes: [UInt8] = [0x48, 0x69, 0xAA]
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "Hi™")
  }

  @Test func readStringMacRomanCopyright() {
    // Mac OS Roman © is single byte 0xA9
    let bytes: [UInt8] = [0x54, 0x65, 0x73, 0x74, 0xA9]
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "Test©")
  }

  @Test func readStringMacRomanFolderChar() {
    // ƒ (0xC4) surrounded by ASCII — 0xC4 is a 2-byte UTF-8 start byte
    // but next byte is ASCII, so UTF-8 fails and Mac OS Roman takes over
    let bytes: [UInt8] = [0x47, 0x61, 0x6D, 0x65, 0x73, 0xC4]
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "Gamesƒ")
  }

  @Test func readStringMacRomanAccentedChars() {
    // Common Mac OS Roman accented characters: é(0x8E) è(0x8F) ü(0x9F)
    let bytes: [UInt8] = [0x43, 0x61, 0x66, 0x8E]  // "Café"
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "Café")
  }

  @Test func readStringMacRomanBullet() {
    // • (bullet) is Mac OS Roman 0xA5
    let bytes: [UInt8] = [0xA5, 0x20, 0x49, 0x74, 0x65, 0x6D]  // "• Item"
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "• Item")
  }

  @Test func readStringMacRomanAppleLogo() {
    //  (Apple logo) is Mac OS Roman 0xF0 → U+F8FF (Private Use Area).
    // 0xF0 is also a 4-byte UTF-8 start byte, but without three valid
    // continuation bytes UTF-8 fails and Mac OS Roman takes over.
    let bytes: [UInt8] = [0xF0]
    let data = Data(bytes)
    let result = data.readString(at: 0, length: data.count)
    #expect(result == "\u{F8FF}")
  }

  @Test func readStringMacRomanAppleLogoInContext() {
    //  among ASCII text: "Made on " — 0xF0 surrounded by ASCII
    let bytes: [UInt8] = [0x4D, 0x61, 0x64, 0x65, 0x20, 0x6F, 0x6E, 0x20, 0xF0]
    let data = Data(bytes)
    let result = data.readString(at: 0, length: data.count)
    #expect(result == "Made on \u{F8FF}")
  }

  @Test func readStringMacRomanFolderCharInContext() {
    // ƒ (0xC4) commonly used in classic Mac file/folder names like "Applicationsƒ"
    let bytes: [UInt8] = [0x41, 0x70, 0x70, 0x6C, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6F, 0x6E, 0x73, 0xC4]
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "Applicationsƒ")
  }

  // MARK: - readString: Shift-JIS (Japanese clients)

  @Test func readStringShiftJISKanji() {
    // Shift-JIS for "日本語" (nihongo = Japanese)
    // 日 = 0x93 0xFA, 本 = 0x96 0x7B, 語 = 0x8C 0xEA
    let bytes: [UInt8] = [0x93, 0xFA, 0x96, 0x7B, 0x8C, 0xEA]
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "日本語")
  }

  @Test func readStringShiftJISMixedWithASCII() {
    // Shift-JIS "Hello日本" — ASCII followed by kanji
    // H=0x48, e=0x65, l=0x6C, l=0x6C, o=0x6F, 日=0x93 0xFA, 本=0x96 0x7B
    let bytes: [UInt8] = [0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x93, 0xFA, 0x96, 0x7B]
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "Hello日本")
  }

  @Test func readStringShiftJISNotTriggeredByMacRoman() {
    // Mac OS Roman ™ (0xAA) should NOT be decoded as Shift-JIS half-width
    // katakana ｪ — the CJK character check prevents this false positive.
    let bytes: [UInt8] = [0x48, 0x69, 0xAA]
    let data = Data(bytes)
    #expect(data.readString(at: 0, length: data.count) == "Hi™")
  }

  // MARK: - readString: offset and length

  @Test func readStringWithOffset() {
    // "Hello World" but read only "World" starting at offset 6
    let bytes: [UInt8] = Array("Hello World".utf8)
    let data = Data(bytes)
    #expect(data.readString(at: 6, length: 5) == "World")
  }
}
