// MessageBoardTests

import Testing
import Foundation
@testable import Hotline

struct MessageBoardTests {

  // MARK: - Divider Parsing

  @Test func simpleDividerSplitsPosts() {
    let text = "Post one\r__________________\rPost two"
    let posts = HotlineClient.parseMessageBoard(text)
    #expect(posts.count == 2)
    #expect(posts[0] == "Post one")
    #expect(posts[1] == "Post two")
  }

  @Test func dividerWithEmbeddedTextSplitsPosts() {
    let text = "Post one\r_______________ [ higher intellect ] ___________________\rPost two"
    let posts = HotlineClient.parseMessageBoard(text)
    #expect(posts.count == 2)
    #expect(posts[0] == "Post one")
    #expect(posts[1] == "Post two")
  }

  @Test func dashDivider() {
    let text = "Post one\r------------------\rPost two"
    let posts = HotlineClient.parseMessageBoard(text)
    #expect(posts.count == 2)
  }

  @Test func shortDividerNotSplit() {
    // Fewer than 15 chars should NOT be treated as a divider
    let text = "Post one\r_____\rStill post one"
    let posts = HotlineClient.parseMessageBoard(text)
    #expect(posts.count == 1)
  }

  @Test func noDividerReturnsSinglePost() {
    let text = "Just a single post with no dividers"
    let posts = HotlineClient.parseMessageBoard(text)
    #expect(posts.count == 1)
    #expect(posts[0] == text)
  }

  @Test func emptyTextReturnsNoPosts() {
    let posts = HotlineClient.parseMessageBoard("")
    #expect(posts.isEmpty)
  }

  @Test func multipleDividersSplitMultiplePosts() {
    let text = "Post 1\r____________________\rPost 2\r____________________\rPost 3"
    let posts = HotlineClient.parseMessageBoard(text)
    #expect(posts.count == 3)
  }

  @Test func leadingDividerSkipped() {
    let text = "____________________\rPost after divider"
    let posts = HotlineClient.parseMessageBoard(text)
    #expect(posts.count == 1)
    #expect(posts[0] == "Post after divider")
  }

  // MARK: - Byte-Level Divider Parsing (parseMessageBoardData)

  @Test func byteDataSplitsPosts() {
    let raw = "Post one\r__________________\rPost two"
    let posts = HotlineClient.parseMessageBoardData(Data(raw.utf8))
    #expect(posts.count == 2)
    #expect(posts[0] == "Post one")
    #expect(posts[1] == "Post two")
  }

  @Test func byteDataEmbeddedTextDivider() {
    let raw = "Post one\r_______________ [ higher intellect ] ___________________\rPost two"
    let posts = HotlineClient.parseMessageBoardData(Data(raw.utf8))
    #expect(posts.count == 2)
  }

  @Test func byteDataEmptyReturnsNoPosts() {
    let posts = HotlineClient.parseMessageBoardData(Data())
    #expect(posts.isEmpty)
  }

  @Test func byteDataMixedEncodingPerPostDecoding() {
    // Post 1: UTF-8 "TheBrick™" (™ = E2 84 A2)
    // Divider: 20 underscores
    // Post 2: Mac OS Roman "Hi™" (™ = AA)
    var data = Data()
    data.append(contentsOf: [0x54, 0x68, 0x65, 0x42, 0x72, 0x69, 0x63, 0x6B, 0xE2, 0x84, 0xA2]) // TheBrick™ (UTF-8)
    data.append(0x0D) // \r
    data.append(contentsOf: Array(repeating: UInt8(0x5F), count: 20)) // ____________________
    data.append(0x0D) // \r
    data.append(contentsOf: [0x48, 0x69, 0xAA]) // Hi™ (Mac OS Roman)
    let posts = HotlineClient.parseMessageBoardData(data)
    #expect(posts.count == 2)
    #expect(posts[0] == "TheBrick™")
    #expect(posts[1] == "Hi™")
  }

  @Test func byteDataCRLFLineEndings() {
    let raw = "Post one\r\n__________________\r\nPost two"
    let posts = HotlineClient.parseMessageBoardData(Data(raw.utf8))
    #expect(posts.count == 2)
    #expect(posts[0] == "Post one")
    #expect(posts[1] == "Post two")
  }

  // MARK: - Header Parsing (Username + Date)

  @Test func standardHeader() {
    let post = MessageBoardPost.parse("From eleisa (Thursday November 13, 2025 at 17:22 CET):\nSome message")
    #expect(post.username == "eleisa")
    #expect(post.body == "Some message")
    #expect(post.date != nil)
  }

  @Test func compactDateHeader() {
    let post = MessageBoardPost.parse("From ONiX (Dec23 20:41):\nHello")
    #expect(post.username == "ONiX")
    #expect(post.date != nil)
    #expect(post.yearInferred == true)
  }

  @Test func unixStyleDateHeader() {
    let post = MessageBoardPost.parse("From TheMrKocour (Wed Nov 12 09:07:18 2025):\nContent here")
    #expect(post.username == "TheMrKocour")
    #expect(post.date != nil)
    #expect(post.yearInferred == false)
  }

  @Test func noSpaceBeforeParen() {
    let post = MessageBoardPost.parse("From 0x2400(Sun Mar  9 19:32:30 2025):\nTest")
    #expect(post.username == "0x2400")
    #expect(post.date != nil)
  }

  @Test func multiWordUsername() {
    let post = MessageBoardPost.parse("From Adam Hinkley (Nov04 12:05):\nHello")
    #expect(post.username == "Adam Hinkley")
    #expect(post.date != nil)
  }

  @Test func usernameWithParentheses() {
    let post = MessageBoardPost.parse("From Figgy (macOS 7) (Oct24 04:22):\nHello")
    #expect(post.username == "Figgy (macOS 7)")
    #expect(post.rawDateString == "Oct24 04:22")
    #expect(post.date != nil)
  }

  @Test func noHeaderReturnsBodyOnly() {
    let post = MessageBoardPost.parse("Just some text without a From header")
    #expect(post.username == nil)
    #expect(post.date == nil)
    #expect(post.body == "Just some text without a From header")
  }

  @Test func emptyBodyAfterHeader() {
    let post = MessageBoardPost.parse("From user (Feb 10 12:00):")
    #expect(post.username == "user")
    #expect(post.body == "")
  }

  // MARK: - Date Parsing Formats

  @Test func fullDateWithTimezone() {
    let post = MessageBoardPost.parse("From user (Tuesday February 17, 2026 at 18:37 CET):\nBody")
    #expect(post.date != nil)
    #expect(post.yearInferred == false)
  }

  @Test func fullDateWithoutTimezone() {
    let post = MessageBoardPost.parse("From user (Tuesday February 17, 2026 at 18:37):\nBody")
    #expect(post.date != nil)
    #expect(post.yearInferred == false)
  }

  @Test func dateWithCESTTimezone() {
    let post = MessageBoardPost.parse("From user (Saturday October 4, 2025 at 23:15 CEST):\nBody")
    #expect(post.date != nil)
    #expect(post.yearInferred == false)
  }

  @Test func shortMonthDayTimeNoYear() {
    let post = MessageBoardPost.parse("From user (Dec23 20:41):\nBody")
    #expect(post.date != nil)
    #expect(post.yearInferred == true)
  }

  @Test func unparsableDateStoresRawString() {
    let post = MessageBoardPost.parse("From user (some garbage date):\nBody")
    #expect(post.date == nil)
    #expect(post.rawDateString == "some garbage date")
    #expect(post.username == "user")
  }

  // MARK: - Date Adjustment (Reverse Chronological Order)

  @Test func yearInferredDatesAdjustedToReverseOrder() {
    // Simulate: Post 1 has explicit date Aug 2025, Post 2 has year-inferred
    // date that naively lands in the future relative to Post 1.
    let post1 = MessageBoardPost(
      username: "A", date: makeDate(year: 2025, month: 8, day: 15),
      rawDateString: nil, body: "", yearInferred: false
    )
    let post2 = MessageBoardPost(
      username: "B", date: makeDate(year: 2026, month: 2, day: 8),
      rawDateString: nil, body: "", yearInferred: true
    )
    let adjusted = MessageBoardPost.adjustDates([post1, post2])
    #expect(adjusted[1].date! < adjusted[0].date!)
  }

  @Test func explicitYearDatesNotAdjusted() {
    let post1 = MessageBoardPost(
      username: "A", date: makeDate(year: 2025, month: 8, day: 15),
      rawDateString: nil, body: "", yearInferred: false
    )
    let post2 = MessageBoardPost(
      username: "B", date: makeDate(year: 2026, month: 1, day: 1),
      rawDateString: nil, body: "", yearInferred: false
    )
    let adjusted = MessageBoardPost.adjustDates([post1, post2])
    // Should NOT be adjusted since yearInferred is false
    #expect(adjusted[1].date == post2.date)
  }

  @Test func adjustmentSkipsPostsWithoutDates() {
    let post1 = MessageBoardPost(
      username: "A", date: makeDate(year: 2025, month: 8, day: 15),
      rawDateString: nil, body: "", yearInferred: false
    )
    let post2 = MessageBoardPost(
      username: "B", date: nil,
      rawDateString: "bad date", body: "", yearInferred: false
    )
    let post3 = MessageBoardPost(
      username: "C", date: makeDate(year: 2026, month: 2, day: 8),
      rawDateString: nil, body: "", yearInferred: true
    )
    let adjusted = MessageBoardPost.adjustDates([post1, post2, post3])
    // Post 3 should still be adjusted relative to Post 1 despite Post 2 having no date
    #expect(adjusted[2].date! < adjusted[0].date!)
  }

  // MARK: - Helpers

  private func makeDate(year: Int, month: Int, day: Int) -> Date {
    var components = DateComponents()
    components.year = year
    components.month = month
    components.day = day
    components.hour = 12
    components.timeZone = TimeZone.current
    return Calendar.current.date(from: components)!
  }
}
