import { IsIn, IsObject, IsOptional } from 'class-validator'

export const ANALYTICS_EVENTS = ['login', 'register', 'demand_publish', 'demand_respond', 'event_enroll', 'checkin', 'mall_order', 'article_submit', 'space_reserve', 'favorite', 'search']
export class AnalyticsDto {
  @IsIn(ANALYTICS_EVENTS) name!: string
  @IsOptional() @IsObject() payload?: Record<string, unknown>
}
