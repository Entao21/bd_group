library(htmltools)
library(yaml)

carousel <- function(id, duration, items) {
  index <- -1
  items <- lapply(items, function(item) {
    index <<- index + 1
    item$title <- if (is.null(item$title)) "Greenland Analysis" else item$title
    item$caption <- if (is.null(item$caption)) "" else item$caption
    item$image <- if (is.null(item$image)) "images/placeholder.png" else item$image
    item$code <- if (is.null(item$code)) "" else item$code
    item$link <- if (is.null(item$link)) "" else item$link
    carouselItem(item$title, item$caption, item$image, item$link, item$code, index, duration)
  })
  
  indicators <- div(class = "carousel-indicators",
                    tagList(lapply(items, function(item) item$button)))
  
  items_div <- div(class = "carousel-inner",
                   style = "height: 750px; width: 100%;",
                   tagList(lapply(items, function(item) item$item)))
  
  div(id = id, class = "carousel carousel-dark slide", `data-bs-ride` = "false", 
      style = "background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px;",
      indicators,
      items_div,
      navButton(id, "prev", "Previous"),
      navButton(id, "next", "Next"))
}

carouselItem <- function(title, caption, image, link, code, index, interval) {
  # ... (保持你提供的 carouselItem 逻辑，增加对代码块样式的微调)
  title_element <- tags$h4(class = "mt-2", style = "color: #0b3d66; text-align: center; font-weight: bold;", title)
  caption_element <- tags$p(style = "padding: 0 40px; font-size: 0.9em; text-align: center;", caption)
  
  image_row <- div(style = "padding: 10px; height: 300px; display: flex; align-items: center; justify-content: center;",
                   img(src = image, style = "max-height: 100%; max-width: 100%; object-fit: contain; border-radius: 4px;"))
  
  code_row <- div(style = "padding: 10px 40px;",
                  tags$pre(style = "background: #ffffff; color: #333333; border: 1px solid #dee2e6; padding: 15px; border-radius: 5px; height: 220px; overflow-y: auto; text-align: left; font-size: 0.8em;",
                           tags$code(code)))
  
  item <- div(class = paste0("carousel-item", ifelse(index == 0, " active", "")),
              style = "height: 750px; padding: 40px 20px;",
              title_element,
              caption_element,
              image_row,
              code_row)
  
  # ... (返回 button 和 item)
  list(button = tags$button(type="button", `data-bs-target`=paste0("#","gallery-carousel"), `data-bs-slide-to`=index, class=ifelse(index==0,"active","")), item = item)
}

navButton <- function(targetId, type, text) {
  tags$button(class = paste0("carousel-control-", type), type = "button", `data-bs-target` = paste0("#", targetId), `data-bs-slide` = type,
              span(class = paste0("carousel-control-", type, "-icon"), `aria-hidden` = "true"))
}